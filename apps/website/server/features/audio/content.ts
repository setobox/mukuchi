import type { AudioArticle } from '../../../shared/audio/model'
import { parseMarkdown } from '@nuxtjs/mdc/runtime'
import { articleRoute } from '../../../shared/admin/model'
import { digest, normalizeSummaryInput } from '../../../shared/ai/model'
import { readFrontmatter, splitDocument } from '../../../shared/content/document'

interface Node { type?: string, tag?: string, value?: string, props?: Record<string, unknown>, children?: Node[] }
const blocks = new Set(['p', 'div', 'section', 'blockquote', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'tr', 'ul', 'ol', 'details', 'summary', 'scroll-container', 'code-group', 'template'])
const silent = new Set(['script', 'style', 'svg', 'canvas', 'icon', 'app-icon', 'binding', 'button', 'input', 'select', 'textarea', 'form', 'nav'])
const embedded: Record<string, string> = {
  github: '这里作者分享了一个项目链接。',
  bilibili: '这里作者附上了一段视频。',
  youtube: '这里作者附上了一段视频。',
  video: '这里作者附上了一段视频。',
  audio: '这里作者附上了一段音频。',
  iframe: '这里作者补充了一份资料。',
}
const urlReference = /\b(?:[a-z][a-z\d+.-]*:\/\/|www\.)[^\s<>"'\x60，。！？；：、（）【】《》]+/gi
// Bare paths require a known directory, a filename or a trailing separator.
// This leaves ordinary prose such as Vue/Nuxt, HTTP/2 and 2026/09/26 intact.
const pathReference = /(?<![\w./\\])(?:[a-z]:[\\/]|\\\\|(?:~|\.\.?)?[\\/])[\w.$@%+~\\/-]+|(?<![\w./\\])[a-z_.$@][\w.$@%+~-]*(?:[\\/][\w.$@%+~-]+)+[\\/]?/gi
const unicodeFileReference = /(?<![\w./\\])(?:[a-z]:[\\/]|\\\\|(?:~|\.\.?)?[\\/]|[a-z_.$@][\w.$@%+~-]*[\\/])(?:[\p{L}\p{N}_.$@%+~-]+[\\/])*[\p{L}\p{N}_.$@%+~-]+\.[a-z][a-z\d]{0,11}(?![a-z\d./\\])/giu
const directoryRoot = /^(?:apps?|assets?|bin|build|components?|config|content|data|dist|docs?|etc|lib|node_modules|packages?|pages?|public|scripts?|server|shared|src|tests?|tmp|usr|var)[\\/]/i

function pathLabel(value: string): string {
  const explicit = /^(?:[a-z]:[\\/]|\\\\|(?:~|\.\.?)?[\\/]|\.[\w.-]+[\\/])/i.test(value)
  const file = /[\\/][^\\/]+\.[a-z][a-z\d]{0,11}$/i.test(value)
  const directory = /[\\/]$/.test(value)
  if (!explicit && !file && !directory && !directoryRoot.test(value))
    return value
  return directory ? '这个目录' : file ? '这个文件' : '这个路径'
}
function replaceReference(value: string, replacement: (reference: string) => string): string {
  const suffix = value.match(/[.,!?;:，。！？；：、)\]}>]+$/)?.[0] ?? ''
  return replacement(value.slice(0, value.length - suffix.length)) + suffix
}
function speechText(value: string): string {
  return value
    .replace(urlReference, value => replaceReference(value, () => '这个链接'))
    .replace(unicodeFileReference, () => '这个文件')
    .replace(pathReference, value => replaceReference(value, pathLabel))
}
function plainText(node: Node): string {
  return node.type === 'text' ? node.value ?? '' : (node.children ?? []).map(plainText).join('')
}
function inlineCode(node: Node): string {
  const value = plainText(node).trim()
  if (!value)
    return ''
  if (/^(?:[a-z][a-z\d+.-]*:\/\/|www\.)\S+$/i.test(value))
    return '这个链接'
  const path = pathLabel(value)
  if (path !== value)
    return path
  const text = speechText(value)
  if (/^[\p{L}\p{N}_$]+(?:[.+#-][\p{L}\p{N}_$]+)*[+#]*$/u.test(text) || /^\d+(?:\/\d+){1,2}$/.test(text))
    return text
  return '这段代码'
}
function readable(node: Node): string {
  if (node.type === 'text')
    return speechText(node.value ?? '')
  const tag = (node.tag?.toLowerCase() ?? '').replace(/^prose-/, '')
  const ariaHidden = node.props?.ariaHidden ?? node.props?.['aria-hidden']
  if (silent.has(tag) || node.props?.hidden === true || node.props?.hidden === '' || ariaHidden === 'true' || ariaHidden === true)
    return ''
  // MDC slots contain content as well as controls. Do not read action labels.
  if (tag === 'template' && Object.keys(node.props ?? {}).some(key => /^(?:v-slot:|#)(?:actions?|trigger|icon|leading|trailing)$/.test(key)))
    return ''
  if (Object.hasOwn(embedded, tag))
    return `\n${embedded[tag]}\n`
  if (tag === 'pre')
    return '\n这里作者提供了一段代码示例。\n'
  if (tag === 'code')
    return inlineCode(node)
  if (tag === 'img')
    return typeof node.props?.alt === 'string' && node.props.alt ? `\n这里作者配了一张图，${speechText(node.props.alt).replace(/[。.!?！？]+$/, '')}。\n` : ''
  if (tag === 'a' && typeof node.props?.href === 'string') {
    // Autolinks may show a domain without its protocol.
    const label = plainText(node).trim()
    const address = node.props.href.replace(/^[a-z][a-z\d+.-]*:\/\//i, '').replace(/\/$/, '')
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(node.props.href) && label.replace(/\/$/, '') === address)
      return '这个链接'
  }
  const children = (node.children ?? []).map(readable).join('')
  if (tag === 'br' || tag === 'hr')
    return '\n'
  if (tag === 'td' || tag === 'th')
    return `${children}；`
  return blocks.has(tag) ? `\n${children}\n` : children
}
export async function audioArticle(path: string, source: string): Promise<AudioArticle> {
  const metadata = readFrontmatter(source, path)
  if (!metadata || typeof metadata !== 'object' || !('title' in metadata) || typeof metadata.title !== 'string')
    throw new Error(`文章标题无效：${path}`)
  const title = metadata.title.trim()
  const body = splitDocument(source).body
  const parsed = await parseMarkdown(`${title}\n\n${body}`, { highlight: false, toc: false })
  const text = readable(parsed.body as Node)
    .replace(/(这里作者提供了一段代码示例。|这里作者附上了一段视频。|这里作者分享了一个项目链接。|这里作者附上了一段音频。|这里作者补充了一份资料。)(?:\s*\1)+/g, '$1')
    .replace(/[\t ]+/g, ' ')
    .replace(/\n\s*\n/g, '\n\n')
    .trim()
  const audio = 'audio' in metadata && metadata.audio && typeof metadata.audio === 'object' ? metadata.audio : {}
  return {
    path: articleRoute(path),
    title,
    inputHash: await digest(normalizeSummaryInput(title, body)),
    narration: text,
    podcast: text,
    narrationEnabled: !('narration' in audio && audio.narration === false),
    podcastEnabled: !('podcast' in audio && audio.podcast === false),
  }
}
