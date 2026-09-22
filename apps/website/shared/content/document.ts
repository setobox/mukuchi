import { parseDocument } from 'yaml'
import { aboutFields, postSchema } from './schema.ts'

export function splitDocument(source: string) {
  const match = /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(source)
  return match ? { header: match[0], yaml: match[1]!, body: source.slice(match[0].length) } : { header: '', yaml: '', body: source }
}
export function readFrontmatter(source: string, filename: string): unknown {
  const parts = splitDocument(source)
  if (!parts.header)
    throw new Error(`${filename}：缺少 YAML frontmatter`)
  const document = parseDocument(parts.yaml, { uniqueKeys: true })
  if (document.errors.length)
    throw new Error(`${filename}：${document.errors.map(error => error.message).join('；')}`)
  return document.toJS({ maxAliasCount: 20 }) as unknown
}
export function validateFrontmatter(source: string, filename: string, kind: 'posts' | 'about' | 'use') {
  const metadata = readFrontmatter(source, filename)
  if (metadata && typeof metadata === 'object' && ['path', '_path', 'id', 'stem'].some(key => key in metadata))
    throw new Error(`${filename}：文章路径和标识由文件路径生成，不能通过 frontmatter 覆盖`)
  const result = (kind === 'posts' ? postSchema : aboutFields).safeParse(metadata)
  if (!result.success)
    throw new Error(`${filename}：${result.error.issues.map(issue => `${issue.path.join('.')} ${issue.message}`).join('；')}`)
  return result.data
}
