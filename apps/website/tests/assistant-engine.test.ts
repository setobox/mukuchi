import type { AdminDatabase } from '../server/features/admin/database'
import type { EngineDependencies } from '../server/features/assistant/engine'
import type { TurnRequest } from '../shared/assistant/model'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { createPublicContent } from '../server/features/assistant/content'
import { signTurn } from '../server/features/assistant/crypto'
import { contextMessages, createAssistantEngine } from '../server/features/assistant/engine'
import { AliyunModerationError } from '../server/features/assistant/moderation'
import { createAssistantRepository } from '../server/features/assistant/repository'
import { assistantCredentialsSchema, defaultAssistantSettings } from '../shared/assistant/settings'
import { prepareSearchDocuments } from '../shared/content/search'

const databases: DatabaseSync[] = []
afterEach(() => {
  for (const db of databases.splice(0)) db.close()
})
const timestamp = Date.now()
const actor = 'test-actor'
const secret = btoa('a'.repeat(32))
const document = { id: '/posts/vue', path: '/posts/vue', title: 'Vue 指南', titles: [], content: 'Vue 使用响应式状态和组件构建界面。', description: 'Vue 入门', tags: ['Vue'], categories: ['前端'], pin: 0, publish: '2026-09-20' }
const final = { kind: 'final' as const, intent: { text: 'Vue 使用响应式状态和组件。', articles: [], taxonomy: null, references: [] }, usage: { prompt_tokens: 200, completion_tokens: 30 } }
async function setup(model: EngineDependencies['model'], moderation: EngineDependencies['moderation'] = vi.fn(async () => true), text = '介绍当前文章') {
  const db = new DatabaseSync(':memory:')
  databases.push(db)
  db.exec(readFileSync(new URL('../migrations/admin/0006_assistant.sql', import.meta.url), 'utf8'))
  db.exec(readFileSync(new URL('../migrations/admin/0007_assistant_budget.sql', import.meta.url), 'utf8'))
  const connection: AdminDatabase = {
    async batch(statements) {
      db.exec('BEGIN IMMEDIATE')
      try {
        const rows = statements.map(statement => db.prepare(statement.sql).all(...(statement.params ?? [])) as Record<string, unknown>[])
        db.exec('COMMIT')
        return rows
      }
      catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    },
    close: () => {},
  }
  const repository = createAssistantRepository(connection)
  const settings = { ...defaultAssistantSettings, inputPriceMicrosPerMillion: 100_000, outputPriceMicrosPerMillion: 300_000, moderationPriceMicros: 100 }
  const content = createPublicContent({ sections: async () => prepareSearchDocuments([document]), siteInfo: async () => ({ name: 'Setobox' }) })
  const request: TurnRequest = { requestId: crypto.randomUUID(), conversationId: crypto.randomUUID(), text, page: { path: document.path }, history: [] }
  await repository.admit({ id: request.requestId, actor, ipHash: 'ip', conversationId: request.conversationId, fingerprint: 'x', authenticated: false }, settings, timestamp)
  const engine = createAssistantEngine({ repository, settings, content, credentials: assistantCredentialsSchema.parse({}), secret, actor, signal: new AbortController().signal, now: () => timestamp, model, moderation })
  return { repository, engine, request, content, moderation }
}
const readCall = { id: 'call_1', type: 'function' as const, function: { name: 'get_article' as const, arguments: JSON.stringify({ articleId: '/posts/vue', sectionId: null }) } }
test('每次实际模型输入、工具提案和最终全部可见内容均通过审核，引用来自真正读取的文章', async () => {
  const model = vi.fn<NonNullable<EngineDependencies['model']>>()
    .mockResolvedValueOnce({ kind: 'tools', calls: [readCall], usage: { prompt_tokens: 100, completion_tokens: 30 } })
    .mockResolvedValueOnce({ ...final, intent: { ...final.intent, articles: ['/posts/vue'], references: [{ articleId: '/posts/vue', sectionId: null }] } })
  const moderation = vi.fn<NonNullable<EngineDependencies['moderation']>>(async () => true)
  const { engine, request, repository } = await setup(model, moderation)
  const response = await engine.start(request)
  expect(response.kind).toBe('completed')
  if (response.kind !== 'completed')
    throw new Error('expected completion')
  expect(response.record.proof).toMatch(/^v1\./)
  expect(response.record.assistant.references).toEqual([{ articleId: '/posts/vue', path: '/posts/vue', title: 'Vue 指南' }])
  expect(moderation.mock.calls.map(call => call[1])).toEqual(['input', 'output', 'input', 'output'])
  expect(moderation.mock.calls[2]?.[0]).toContain('Vue 使用响应式状态')
  expect(moderation.mock.calls[3]?.[0]).toContain('Vue 入门')
  expect(moderation.mock.calls[3]?.[0]).toContain('/posts/vue')
  expect((await repository.request(request.requestId, actor))?.status).toBe('completed')
})
test('审核阻断工具提案时不读取正文，不生成签名回复', async () => {
  const model = vi.fn<NonNullable<EngineDependencies['model']>>(async () => ({ kind: 'tools', calls: [readCall], usage: undefined }))
  const moderation = vi.fn<NonNullable<EngineDependencies['moderation']>>().mockResolvedValueOnce(true).mockResolvedValueOnce(false)
  const { engine, request, content, repository } = await setup(model, moderation)
  const read = vi.spyOn(content, 'read')
  await expect(engine.start(request)).rejects.toMatchObject({ code: 'moderation_rejected' })
  expect(read).not.toHaveBeenCalled()
  expect(model).toHaveBeenCalledTimes(1)
  expect((await repository.request(request.requestId, actor))?.status).toBe('failed')
})

test('明确未计费的审核权限错误释放预留；网络结果未知仍保守结算，不调用模型', async () => {
  for (const failure of [new AliyunModerationError(403, { Code: 'NoPermission' }), new Error('network error')]) {
    const model = vi.fn<NonNullable<EngineDependencies['model']>>(async () => final)
    const { engine, request, repository } = await setup(model, async () => {
      throw failure
    })
    await expect(engine.start(request)).rejects.toThrow()
    const usage = await repository.usage(new Date(timestamp + 28_800_000).toISOString().slice(0, 10))
    expect(usage.reserved_micros).toBe(0)
    expect(usage.spent_micros).toBe(failure instanceof AliyunModerationError ? 0 : 100)
    expect(model).not.toHaveBeenCalled()
  }
})
test('伪造引用与任意工具文章路径被阻止', async () => {
  const model = vi.fn<NonNullable<EngineDependencies['model']>>(async () => ({ ...final, intent: { ...final.intent, references: [{ articleId: '/posts/vue', sectionId: null }] } }))
  const { engine, request } = await setup(model)
  await expect(engine.start(request)).rejects.toMatchObject({ code: 'invalid_reference' })
  const other = await setup(async () => ({ kind: 'tools', calls: [{ ...readCall, function: { ...readCall.function, arguments: JSON.stringify({ articleId: '/posts/unknown', sectionId: null }) } }], usage: undefined }))
  await expect(other.engine.start(other.request)).rejects.toMatchObject({ code: 'unknown_article' })
})
test('本地历史通过加密续传继续，凭据不能重复使用或跨身份使用', async () => {
  const historyCall = { id: 'history_1', type: 'function' as const, function: { name: 'get_history' as const, arguments: '{"limit":2}' } }
  const model = vi.fn<NonNullable<EngineDependencies['model']>>().mockResolvedValueOnce({ kind: 'tools', calls: [historyCall], usage: undefined }).mockResolvedValueOnce(final)
  const { engine, request } = await setup(model)
  const previous = await signTurn(secret, actor, { id: crypto.randomUUID(), conversationId: request.conversationId, createdAt: timestamp - 100, user: 'Vue 好用吗', assistant: { id: crypto.randomUUID(), role: 'assistant', blocks: [{ type: 'text', text: '可以读入门文章。' }], references: [] } })
  const response = await engine.start(request)
  expect(response.kind).toBe('needs_history')
  if (response.kind !== 'needs_history')
    throw new Error('expected history')
  expect(response.historyRequest).toEqual({ before: null, limit: 2 })
  expect((await engine.resume(response.continuation, [previous])).kind).toBe('completed')
  await expect(engine.resume(response.continuation, [previous])).rejects.toMatchObject({ code: 'invalid_continuation' })
  expect(model).toHaveBeenCalledTimes(2)
})
test('完整消息在上下文窗口边界被移除，不截断后伪装为完整历史', async () => {
  const record = await signTurn(secret, actor, { id: crypto.randomUUID(), conversationId: crypto.randomUUID(), createdAt: timestamp - 100, user: '上次的问题', assistant: { id: crypto.randomUUID(), role: 'assistant', blocks: [{ type: 'text', text: '长'.repeat(1800) }], references: [] } })
  const request = { requestId: crypto.randomUUID(), conversationId: record.conversationId, text: 'x'.repeat(500), page: { path: null }, history: [record] }
  const context = contextMessages({ request, groups: [] })
  expect(context.limited).toBe(true)
  expect(JSON.stringify(context.messages).length).toBeLessThanOrEqual(2000)
  expect(context.messages[0]?.content).not.toContain('上次的问题')
  expect(context.messages[0]?.content).toContain(request.text)
})

test('历史续传遵守条数限制并移动游标，同时保留最近上下文', async () => {
  const call = { id: 'history_one', type: 'function' as const, function: { name: 'get_history' as const, arguments: '{"limit":1}' } }
  const model = vi.fn<NonNullable<EngineDependencies['model']>>()
    .mockResolvedValueOnce({ kind: 'tools', calls: [call], usage: undefined })
    .mockResolvedValueOnce({ kind: 'tools', calls: [{ ...call, id: 'history_two' }], usage: undefined })
    .mockResolvedValueOnce(final)
  const { engine, request } = await setup(model)
  const records = await Promise.all([0, 1, 2].map(i => signTurn(secret, actor, { id: crypto.randomUUID(), conversationId: request.conversationId, createdAt: timestamp - 300 + i * 100, user: `问题${i}`, assistant: { id: crypto.randomUUID(), role: 'assistant', blocks: [{ type: 'text', text: `回答${i}` }], references: [] } })))
  request.history = [records[2]!]
  const first = await engine.start(request)
  if (first.kind !== 'needs_history')
    throw new Error('expected history')
  expect(first.historyRequest).toEqual({ before: records[2]!.id, limit: 1 })
  await expect(engine.resume(first.continuation, records.slice(0, 2))).rejects.toMatchObject({ code: 'invalid_history' })
  const second = await engine.resume(first.continuation, [records[1]!])
  if (second.kind !== 'needs_history')
    throw new Error('expected history')
  expect(second.historyRequest).toEqual({ before: records[1]!.id, limit: 1 })
  expect((await engine.resume(second.continuation, [records[0]!])).kind).toBe('completed')
  expect(model.mock.calls[2]?.[2].messages.find(message => message.role === 'user')?.content).toContain('问题2')
})
test('无限工具循环触及上限终止，不继续收费调用', async () => {
  const model = vi.fn<NonNullable<EngineDependencies['model']>>(async () => ({ kind: 'tools', calls: [{ id: 'site', type: 'function', function: { name: 'get_site_info', arguments: '{"scope":"site"}' } }], usage: undefined }))
  const { engine, request } = await setup(model)
  await expect(engine.start(request)).rejects.toMatchObject({ code: 'call_limit' })
  expect(model).toHaveBeenCalledTimes(5)
})
