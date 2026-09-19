import type { H3Event } from 'h3'
import type { SummaryState } from '../../../shared/ai/model'
import { z } from 'zod'
import { AdminError } from '../../../shared/admin/model'
import { aiSettingsSchema, matchingSummary, summaryConfigHash, summaryInputLimit, summaryTextSchema } from '../../../shared/ai/model'
import { readAdminJson, withAdmin } from '../admin/http'
import { requireOwner } from '../auth/session'
import { summaryInput, writeSummary } from './content'
import { decryptApiKey, encryptApiKey, encryptionReady } from './crypto'
import { generateSummary } from './provider'
import { createAiRepository } from './repository'

export const withAi = <T>(event: H3Event, action: (repo: ReturnType<typeof createAiRepository>) => Promise<T>) => withAdmin(event, repo => action(createAiRepository(repo.query)))
const encryptionSecret = (event: H3Event) => String(useRuntimeConfig(event).aiEncryptionKey || '')
export async function settingsView(event: H3Event) {
  const stored = await withAi(event, repo => repo.settings())
  return { ...stored.settings, version: stored.version, keyConfigured: !!stored.encryptedKey, encryptionReady: await encryptionReady(encryptionSecret(event)) }
}
export async function settingsRoute(event: H3Event) {
  await requireOwner(event)
  if (event.method === 'GET')
    return settingsView(event)
  const input = aiSettingsSchema.extend({ version: z.number().int().nonnegative(), apiKey: z.string().trim().max(4096).optional(), clearKey: z.boolean().optional() }).strict().parse(await readAdminJson(event))
  const previous = await withAi(event, repo => repo.settings())
  if (previous.version !== input.version)
    throw new AdminError(409, 'AI 设置已修改，请刷新后重试')
  let key = input.clearKey ? '' : previous.encryptedKey
  if (input.apiKey)
    key = await encryptApiKey(input.apiKey, encryptionSecret(event))
  const settings = aiSettingsSchema.parse({ enabled: input.enabled, baseUrl: input.baseUrl, model: input.model, prompt: input.prompt })
  if (settings.enabled && (!settings.baseUrl || !settings.model || !key || !await encryptionReady(encryptionSecret(event))))
    throw new AdminError(422, '启用前请配置服务地址、模型、API 密钥及服务端加密密钥')
  await withAi(event, repo => repo.saveSettings(settings, key, input.version))
  return settingsView(event)
}
export async function testConnection(event: H3Event) {
  await requireOwner(event)
  const stored = await withAi(event, repo => repo.settings())
  const key = await decryptApiKey(stored.encryptedKey, encryptionSecret(event))
  await generateSummary(stored.settings, key, '连接测试\n\n这是一项博客摘要服务连接测试。博客提供文章阅读与分类浏览。')
  return { message: '连接成功，模型已返回有效摘要。' }
}
export async function currentSummary(event: H3Event, source: string): Promise<SummaryState> {
  try {
    const article = await summaryInput(source)
    if (!article.enabled)
      return { status: 'disabled', record: article.record, message: '此文章已关闭 AI 摘要。' }
    const { settings } = await withAi(event, repo => repo.settings())
    if (!settings.enabled)
      return { status: 'disabled', record: article.record, message: 'AI 摘要服务未启用。' }
    const configHash = await summaryConfigHash(settings)
    if (matchingSummary(article.record, article.inputHash, configHash))
      return { status: 'valid', record: article.record, message: '' }
    const cached = await withAi(event, repo => repo.cached(article.inputHash, configHash))
    if (cached)
      return { status: 'valid', record: cached, message: '' }
    if (Array.from(article.input).length > summaryInputLimit)
      return { status: article.record ? 'stale' : 'missing', record: article.record, message: '输入超过 32,000 字符，自动生成将使用原简介，请手动填写摘要。' }
    return { status: article.record ? 'stale' : 'missing', record: article.record, message: article.record ? '标题、正文或生成配置已变化，下次构建将重新生成。' : '尚无摘要，下次构建将自动生成。' }
  }
  catch { return { status: 'unavailable', record: null, message: '摘要暂不可用，请检查文章内容和 AI 设置。' } }
}
export async function draftSummaryRoute(event: H3Event, id: string) {
  await requireOwner(event)
  const draft = await withAdmin(event, repo => repo.draft(id))
  if (event.method === 'GET')
    return currentSummary(event, draft.source)
  const input = z.discriminatedUnion('action', [
    z.object({ action: z.literal('generate'), version: z.number().int().positive() }).strict(),
    z.object({ action: z.literal('save'), version: z.number().int().positive(), text: summaryTextSchema }).strict(),
  ]).parse(await readAdminJson(event))
  if (draft.version !== input.version)
    throw new AdminError(409, '草稿已修改，请保存后重试')
  const article = await summaryInput(draft.source)
  const stored = await withAi(event, repo => repo.settings())
  if (!article.enabled || !stored.settings.enabled)
    throw new AdminError(422, '请先启用 AI 摘要')
  const configHash = await summaryConfigHash(stored.settings)
  const text = input.action === 'save' ? input.text.replace(/\s+/g, ' ') : await generateSummary(stored.settings, await decryptApiKey(stored.encryptedKey, encryptionSecret(event)), article.input)
  const record = { text, inputHash: article.inputHash, configHash }
  if (article.record?.text === text && article.record.inputHash === record.inputHash && article.record.configHash === configHash) {
    await withAdmin(event, repo => repo.save(id, input.version, draft.source))
    return { draft: await withAdmin(event, repo => repo.draft(id)), summary: await currentSummary(event, draft.source) }
  }
  // Never put private draft results in the shared build cache.
  await withAdmin(event, repo => repo.save(id, input.version, writeSummary(draft.source, record)))
  const saved = await withAdmin(event, repo => repo.draft(id))
  return { draft: saved, summary: await currentSummary(event, saved.source) }
}
