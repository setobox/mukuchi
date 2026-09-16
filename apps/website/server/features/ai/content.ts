import type { SummaryRecord } from '../../../shared/ai/model.ts'
import { parseDocument } from 'yaml'
import { AdminError } from '../../../shared/admin/model.ts'
import { digest, normalizeSummaryInput, summaryRecordSchema } from '../../../shared/ai/model.ts'
import { readFrontmatter, splitDocument } from '../../../shared/content/document.ts'

export async function summaryInput(source: string) {
  const meta = readFrontmatter(source, '文章')
  if (!meta || typeof meta !== 'object' || !('title' in meta) || typeof meta.title !== 'string' || !meta.title.trim())
    throw new AdminError(422, '请先填写文章标题')
  const body = splitDocument(source).body
  if (!body.trim())
    throw new AdminError(422, '请先填写文章正文')
  const input = normalizeSummaryInput(meta.title, body)
  const record = 'summary' in meta ? summaryRecordSchema.safeParse(meta.summary) : null
  return { input, inputHash: await digest(input), enabled: !('aiSummary' in meta && meta.aiSummary === false), record: record?.success ? record.data : null }
}
export function writeSummary(source: string, record: SummaryRecord) {
  const parts = splitDocument(source)
  const yaml = parseDocument(parts.yaml)
  if (!parts.header || yaml.errors.length)
    throw new AdminError(422, '请先修正文章元数据')
  yaml.set('summary', summaryRecordSchema.parse(record))
  return `---\n${yaml.toString()}---\n${parts.body}`
}
