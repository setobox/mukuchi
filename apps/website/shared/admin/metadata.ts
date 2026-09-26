import { parseDocument } from 'yaml'
import { splitDocument } from '../content/document.ts'

/** Apply related fields together without rewriting the Markdown or YAML comments. */
export function updateMetadata(source: string, patch: Record<string, unknown>): string {
  const parts = splitDocument(source)
  const document = parseDocument(parts.yaml || '{}')
  if (document.errors.length)
    throw new Error('请先在源码模式修正 YAML 格式')
  for (const [field, value] of Object.entries(patch)) {
    if (value === undefined)
      document.delete(field)
    else
      document.set(field, value)
  }
  return `---\n${document.toString()}---\n${parts.body}`
}
