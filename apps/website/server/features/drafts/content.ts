import { createParseProcessor, parseMarkdown } from '@nuxtjs/mdc/runtime'
import { collectRepositories } from '../../../content/github/scan'
import { AdminError } from '../../../shared/admin/model'
import { readFrontmatter, splitDocument, validateFrontmatter } from '../../../shared/content/document'

interface AstNode { type: string, url?: string, identifier?: string, attributes?: Record<string, unknown>, align?: (string | null)[], meta?: string | null, children?: AstNode[], position?: { start: { offset: number }, end: { offset: number } } }
export interface EditorSegment { source: string, raw: boolean }
const supported = new Set(['root', 'paragraph', 'heading', 'text', 'strong', 'emphasis', 'delete', 'inlineCode', 'link', 'image', 'break', 'thematicBreak', 'blockquote', 'list', 'listItem', 'code', 'table', 'tableRow', 'tableCell'])
function rawNode(node: AstNode): boolean {
  return !supported.has(node.type) || !!node.meta || !!node.attributes || !!node.align?.some(Boolean) || !!node.children?.some(rawNode)
}
export async function editorSegments(source: string): Promise<EditorSegment[]> {
  const body = splitDocument(source).body
  const processor = await createParseProcessor({ highlight: false })
  const ast = processor.parse(body) as AstNode
  if (!ast.children?.length)
    return [{ source: body, raw: false }]
  const segments: EditorSegment[] = []
  let offset = 0
  for (const node of ast.children) {
    if (!node.position)
      throw new AdminError(422, '此内容请使用源码模式编辑')
    const end = node.position.end.offset
    segments.push({ source: body.slice(offset, end), raw: rawNode(node) })
    offset = end
  }
  if (offset < body.length && segments.length)
    segments[segments.length - 1]!.source += body.slice(offset)
  return segments
}
export async function validateArticle(source: string, path: string) {
  try {
    const metadata = validateFrontmatter(source, path, 'posts')
    await collectRepositories([{ filename: path, source }])
    await parseMarkdown(splitDocument(source).body, { highlight: false })
    return metadata
  }
  catch (error) { throw new AdminError(422, error instanceof Error ? error.message : '文章格式无效') }
}
export async function imageReferences(source: string): Promise<Set<string>> {
  const paths = new Set<string>()
  try {
    const meta = readFrontmatter(source, '草稿')
    if (meta && typeof meta === 'object' && 'cover' in meta && typeof meta.cover === 'string')
      paths.add(meta.cover)
  }
  catch { /* Draft metadata can be incomplete. */ }
  const processor = await createParseProcessor({ highlight: false })
  const ast = processor.parse(splitDocument(source).body) as AstNode
  const definitions = new Map<string, string>()
  function collect(node: AstNode) {
    if (node.type === 'definition' && node.identifier && node.url)
      definitions.set(node.identifier.toLowerCase(), node.url)
    node.children?.forEach(collect)
  }
  collect(ast)
  function visit(node: AstNode) {
    if (node.type === 'code' || node.type === 'inlineCode')
      return
    if (node.type === 'image' && node.url)
      paths.add(node.url)
    if (node.type === 'imageReference' && node.identifier) {
      const url = definitions.get(node.identifier.toLowerCase())
      if (url)
        paths.add(url)
    }
    for (const [key, value] of Object.entries(node.attributes ?? {})) {
      if (['src', 'cover', 'poster'].includes(key) && typeof value === 'string')
        paths.add(value)
    }
    node.children?.forEach(visit)
  }
  visit(ast)
  const rendered = await parseMarkdown(splitDocument(source).body, { highlight: false, toc: false })
  function collectRendered(node: { props?: Record<string, unknown>, children?: unknown[] }) {
    for (const key of ['src', 'cover', 'poster']) {
      const value = node.props?.[key]
      if (typeof value === 'string')
        paths.add(value)
    }
    for (const child of node.children ?? []) {
      if (child && typeof child === 'object')
        collectRendered(child)
    }
  }
  collectRendered(rendered.body)
  return paths
}
