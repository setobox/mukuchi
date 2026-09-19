import type { AudioArticle } from '../../../shared/audio/model'
import { parseMarkdown } from '@nuxtjs/mdc/runtime'
import { articleRoute } from '../../../shared/admin/model'
import { digest, normalizeSummaryInput } from '../../../shared/ai/model'
import { readFrontmatter, splitDocument } from '../../../shared/content/document'

interface Node { type?: string, tag?: string, value?: string, props?: Record<string, unknown>, children?: Node[] }
const blocks = new Set(['p', 'div', 'section', 'blockquote', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'tr', 'ul', 'ol'])
function readable(node: Node, narration: boolean): string {
  if (node.type === 'text')
    return node.value ?? ''
  const tag = node.tag?.toLowerCase() ?? ''
  if (['script', 'style', 'iframe'].includes(tag))
    return ''
  if (tag === 'pre') {
    if (narration)
      return '\n代码示例请参阅原文。\n'
    return `\n${typeof node.props?.code === 'string' ? node.props.code : (node.children ?? []).map(child => readable(child, false)).join('')}\n`
  }
  if (tag === 'img')
    return typeof node.props?.alt === 'string' && node.props.alt ? `\n图片：${node.props.alt}。\n` : ''
  const children = (node.children ?? []).map(child => readable(child, narration)).join('')
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
  const parsed = await parseMarkdown(body, { highlight: false, toc: false })
  const text = (narration: boolean) => `${title}\n\n${readable(parsed.body as Node, narration)}`.replace(/[\t ]+/g, ' ').replace(/\n\s*\n/g, '\n\n').trim()
  const audio = 'audio' in metadata && metadata.audio && typeof metadata.audio === 'object' ? metadata.audio : {}
  return {
    path: articleRoute(path),
    title,
    inputHash: await digest(normalizeSummaryInput(title, body)),
    narration: text(true),
    podcast: text(false),
    narrationEnabled: !('narration' in audio && audio.narration === false),
    podcastEnabled: !('podcast' in audio && audio.podcast === false),
  }
}
