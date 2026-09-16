import type { AiSettings, SummaryRecord, SummarySnapshot } from '../../../shared/ai/model.ts'
import { digest, matchingSummary, summaryConfigHash, summaryInputLimit } from '../../../shared/ai/model.ts'
import { summaryInput } from './content.ts'

export interface SummaryArticle { path: string, source: string }
export interface SummaryPreparation {
  settings: AiSettings | null
  cached: (inputHash: string, configHash: string) => Promise<SummaryRecord | null>
  cache: (record: SummaryRecord) => Promise<void>
  generate: (input: string, signal: AbortSignal) => Promise<string>
  warn: (path: string, reason?: string) => void
  budgetMs?: number
}
export async function prepareSummaries(articles: SummaryArticle[], options: SummaryPreparation): Promise<SummarySnapshot> {
  const ordered = [...articles].sort((a, b) => a.path.localeCompare(b.path))
  const manifestHash = await digest(JSON.stringify(ordered.map(article => [article.path, article.source])))
  const configHash = options.settings?.enabled ? await summaryConfigHash(options.settings) : null
  const records: Record<string, SummaryRecord> = {}
  if (!configHash)
    return { version: 1, manifestHash, configHash, records }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.budgetMs ?? 180_000)
  let cursor = 0
  const pending = new Map<string, Promise<SummaryRecord>>()
  function withinBudget<T>(action: () => Promise<T>): Promise<T> {
    if (controller.signal.aborted)
      return Promise.reject(new Error('Time budget exceeded'))
    return new Promise((resolve, reject) => {
      const abort = () => reject(new Error('Time budget exceeded'))
      controller.signal.addEventListener('abort', abort, { once: true })
      action().then(resolve, reject).finally(() => controller.signal.removeEventListener('abort', abort))
    })
  }
  async function worker() {
    while (cursor < ordered.length) {
      const article = ordered[cursor++]!
      try {
        const input = await summaryInput(article.source)
        if (!input.enabled)
          continue
        if (matchingSummary(input.record, input.inputHash, configHash)) {
          records[article.path] = input.record
          continue
        }
        if (Array.from(input.input).length > summaryInputLimit) {
          options.warn(article.path, '输入超过 32,000 字符，请手动填写摘要')
          continue
        }
        let result = pending.get(input.inputHash)
        if (!result) {
          result = (async () => {
            const cached = await withinBudget(() => options.cached(input.inputHash, configHash!))
            if (cached)
              return cached
            if (controller.signal.aborted)
              throw new Error('Time budget exceeded')
            const record = { text: await withinBudget(() => options.generate(input.input, controller.signal)), inputHash: input.inputHash, configHash: configHash! }
            await withinBudget(() => options.cache(record))
            return record
          })()
          pending.set(input.inputHash, result)
        }
        records[article.path] = await result
      }
      catch { options.warn(article.path) }
    }
  }
  try {
    await Promise.all([worker(), worker()])
  }
  finally { clearTimeout(timer) }
  return { version: 1, manifestHash, configHash, records }
}
