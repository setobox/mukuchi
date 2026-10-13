import type { AdminDatabase } from '../server/features/admin/database'
import type { EngineDependencies } from '../server/features/assistant/engine'
import type { TurnRequest } from '../shared/assistant/model'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { z } from 'zod'
import { createPublicContent } from '../server/features/assistant/content'
import { signTurn, unseal, verifyHistory } from '../server/features/assistant/crypto'
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
async function setup(model: EngineDependencies['model'], moderation: EngineDependencies['moderation'] = vi.fn(async () => true), text = '介绍当前文章', emit?: EngineDependencies['emit']) {
  const db = new DatabaseSync(':memory:')
  databases.push(db)
  db.exec(readFileSync(new URL('../migrations/admin/0006_assistant.sql', import.meta.url), 'utf8'))
  db.exec(readFileSync(new URL('../migrations/admin/0007_assistant_budget.sql', import.meta.url), 'utf8'))
  db.exec(readFileSync(new URL('../migrations/admin/0008_runtime_settings_tasks.sql', import.meta.url), 'utf8'))
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
  const settings = { ...defaultAssistantSettings }
  const content = createPublicContent({ sections: async () => prepareSearchDocuments([document]), siteInfo: async () => ({ name: 'Setobox' }) })
  const request: TurnRequest = { requestId: crypto.randomUUID(), conversationId: crypto.randomUUID(), text, page: { path: document.path }, history: [] }
  await repository.admit({ id: request.requestId, actor, ipHash: 'ip', conversationId: request.conversationId, fingerprint: 'x', authenticated: false }, settings, timestamp)
  const engine = createAssistantEngine({ repository, settings, content, credentials: assistantCredentialsSchema.parse({}), secret, actor, signal: new AbortController().signal, now: () => timestamp, model, moderation, emit })
  return { repository, engine, request, content, moderation }
}
const readCall = { id: 'call_1', type: 'function' as const, function: { name: 'get_article' as const, arguments: JSON.stringify({ articleId: '/posts/vue', sectionId: null }) } }

test('管理员预览不审核、不要求公开启用或能力验证，不占日常配额和并发，签名不能混入公开历史', async () => {
  const model = vi.fn<NonNullable<EngineDependencies['model']>>(async () => final)
  const moderation = vi.fn(async () => {
    throw new Error('不应调用审核')
  })
  const { repository, request, content } = await setup(model, moderation)
  await repository.end(request.requestId, actor, 'completed')
  const settings = { ...defaultAssistantSettings, enabled: false, concurrency: 1 }
  await repository.saveSettings(settings, '', 0, '')
  const previewActor = 'admin-preview:owner'
  const preview = { ...request, requestId: crypto.randomUUID() }
  await repository.admitPreview({ id: preview.requestId, actor: previewActor, conversationId: preview.conversationId, fingerprint: 'preview', configVersion: 1 }, timestamp)
  const ordinary = { id: crypto.randomUUID(), actor, ipHash: 'ip', conversationId: request.conversationId, fingerprint: 'ordinary', authenticated: true }
  await expect(repository.admit(ordinary, settings, timestamp)).resolves.toMatchObject({ id: ordinary.id })
  expect(await repository.remaining(actor, 10, timestamp)).toBe(10)
  const engine = createAssistantEngine({ repository, settings, content, credentials: assistantCredentialsSchema.parse({}), secret, actor: previewActor, preview: true, configVersion: 1, signal: new AbortController().signal, now: () => timestamp, model, moderation })
  const result = await engine.start(preview)
  expect(result.kind).toBe('completed')
  expect(moderation).not.toHaveBeenCalled()
  expect(model).toHaveBeenCalledOnce()
  if (result.kind !== 'completed')
    throw new Error('expected completed')
  await expect(verifyHistory(secret, actor, request.conversationId, [result.record])).rejects.toThrow()
  await expect(verifyHistory(secret, previewActor, request.conversationId, [result.record])).resolves.toHaveLength(1)
  await expect(repository.admitPreview({ ...ordinary, configVersion: 1 }, timestamp)).rejects.toMatchObject({ code: 'invalid_preview' })
})

test('新结构按顺序展示，实际文章填充来源，HTML 清理及无效架构降级', async () => {
  const blocks = [
    { type: 'text' as const, text: 'Vue 使用响应式。', sourceIds: ['/posts/vue'] },
    { type: 'html' as const, title: '示例', summary: '结构说明', sourceIds: [], html: '<p onclick="alert(1)">内容</p><script>bad()</script>', css: 'p{color:var(--color-text)}' },
    { type: 'html' as const, title: '降级', summary: '不可用时的文字摘要', sourceIds: [], html: '<p>内容</p>', css: '@import "https://example.com";' },
    { type: 'architecture' as const, title: '循环图', summary: '循环结构摘要', sourceIds: [], nodes: [{ id: 'a', label: 'A', description: '', icon: 'box' as const }], edges: [{ from: 'a', to: 'a', label: '' }] },
  ]
  const model = vi.fn<NonNullable<EngineDependencies['model']>>().mockResolvedValueOnce({ kind: 'tools', calls: [readCall] }).mockImplementationOnce(async (_settings, _credentials, _body, _signal, _fetcher, observer) => {
    await observer?.({ type: 'text', index: 0, text: blocks[0]!.text! })
    for (const [index, block] of blocks.entries())
      await observer?.({ type: 'block', index, block })
    return { kind: 'final', intent: { blocks, articles: [], references: [], taxonomy: null, suggestions: ['举一个例子？'] } }
  })
  const emit = vi.fn()
  const { engine, request, moderation } = await setup(model, undefined, undefined, emit)
  const result = await engine.start(request)
  if (result.kind !== 'completed')
    throw new Error('expected completed')
  expect(result.record.assistant.blocks).toMatchObject([
    blocks[0],
    { type: 'html', html: '<p>内容</p>' },
    { type: 'text', text: expect.stringContaining('不可用时的文字摘要') },
    { type: 'text', text: expect.stringContaining('循环结构摘要') },
  ])
  expect(result.record.assistant.references).toMatchObject([{ title: 'Vue 指南', sourceId: '/posts/vue', excerpt: expect.stringContaining('响应式') }])
  expect(result.record.assistant.suggestions).toEqual(['举一个例子？'])
  expect(emit.mock.calls.some(([, payload]) => payload.label === '正在读取《Vue 指南》…')).toBe(true)
  expect(emit.mock.calls.filter(([, payload]) => payload.type === 'block')).toHaveLength(4)
  expect(moderation).toHaveBeenCalledOnce()
})

test('伪造段落来源即使指向真实文章，也必须有本轮读取依据', async () => {
  const model = vi.fn<NonNullable<EngineDependencies['model']>>(async () => ({ kind: 'final', intent: { blocks: [{ type: 'text', text: '猜测', sourceIds: ['/posts/vue'] }], articles: [], references: [], taxonomy: null, suggestions: [] } }))
  const { engine, request } = await setup(model)
  await expect(engine.start(request)).rejects.toMatchObject({ code: 'invalid_reference' })
})

test('历史续传仅保留结构文字摘要，中文按加密字节预算裁剪，续传不重复审核', async () => {
  const model = vi.fn<NonNullable<EngineDependencies['model']>>().mockResolvedValueOnce({ kind: 'tools', calls: [{ id: 'history', type: 'function', function: { name: 'get_history', arguments: '{"limit":2}' } }] }).mockResolvedValueOnce(final)
  const { engine, request, moderation } = await setup(model)
  request.history = await Promise.all(Array.from({ length: 8 }, (_, index) => signTurn(secret, actor, { id: crypto.randomUUID(), conversationId: request.conversationId, createdAt: timestamp - 100 + index, user: '问'.repeat(500), assistant: { id: crypto.randomUUID(), role: 'assistant', references: [], blocks: [{ type: 'html', title: '历史结构', summary: '摘要'.repeat(500), sourceIds: [], html: '<p class="never-upload">SECRET_HTML</p>', css: '.never-upload{color:red}' }] } })))
  const response = await engine.start(request)
  if (response.kind !== 'needs_history')
    throw new Error('expected history')
  const sealed = JSON.stringify(await unseal(secret, actor, 'continuation', response.continuation, z.unknown()))
  expect(sealed).not.toContain('SECRET_HTML')
  expect(sealed).not.toContain('never-upload')
  expect(new TextEncoder().encode(sealed).byteLength).toBeLessThanOrEqual(30_000)
  expect(sealed).toContain('历史结构')
  expect((await engine.resume(response.continuation, [])).kind).toBe('completed')
  expect(moderation).toHaveBeenCalledOnce()
  expect(JSON.stringify(model.mock.calls.map(call => call[2]))).not.toContain('SECRET_HTML')
})
test('每轮只审核原始用户输入一次，引用来自真正读取的文章', async () => {
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
  expect(response.record.assistant.references).toMatchObject([{ articleId: '/posts/vue', path: '/posts/vue', title: 'Vue 指南', sourceId: '/posts/vue', excerpt: expect.stringContaining('响应式') }])
  expect(moderation.mock.calls.map(call => call[1])).toEqual(['input'])
  expect(moderation.mock.calls[0]?.[0]).toBe(request.text)
  expect(response.record.durationMs).toBe(0)
  expect((await repository.request(request.requestId, actor))?.status).toBe('completed')
  const task = await repository.tasks.detail(request.requestId)
  expect(task).toMatchObject({ status: 'completed', stage: 'done', modelCalls: 2, toolCalls: 1 })
  expect(JSON.stringify(task)).not.toContain(request.text)
  expect(JSON.stringify(task)).not.toContain(final.intent.text)
})
test('用户输入被阻断时不调用模型、不读取正文、不生成签名回复', async () => {
  const model = vi.fn<NonNullable<EngineDependencies['model']>>(async () => ({ kind: 'tools', calls: [readCall], usage: undefined }))
  const moderation = vi.fn<NonNullable<EngineDependencies['moderation']>>().mockResolvedValueOnce(false)
  const { engine, request, content, repository } = await setup(model, moderation)
  const read = vi.spyOn(content, 'read')
  await expect(engine.start(request)).rejects.toMatchObject({ code: 'moderation_rejected' })
  expect(read).not.toHaveBeenCalled()
  expect(model).not.toHaveBeenCalled()
  expect((await repository.request(request.requestId, actor))?.status).toBe('failed')
})

test('审核权限及网络错误记录失败阶段，不调用模型', async () => {
  for (const failure of [new AliyunModerationError(403, { Code: 'NoPermission' }), new Error('network error')]) {
    const model = vi.fn<NonNullable<EngineDependencies['model']>>(async () => final)
    const { engine, request, repository } = await setup(model, async () => {
      throw failure
    })
    await expect(engine.start(request)).rejects.toThrow()
    const task = await repository.tasks.detail(request.requestId)
    expect(task.status).toBe('failed')
    expect(task.steps.at(-1)?.status).toBe('failed')
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
  const { engine, request, repository } = await setup(model)
  const previous = await signTurn(secret, actor, { id: crypto.randomUUID(), conversationId: request.conversationId, createdAt: timestamp - 100, user: 'Vue 好用吗', assistant: { id: crypto.randomUUID(), role: 'assistant', blocks: [{ type: 'text', text: '可以读入门文章。' }], references: [] } })
  const response = await engine.start(request)
  expect(response.kind).toBe('needs_history')
  if (response.kind !== 'needs_history')
    throw new Error('expected history')
  expect(response.historyRequest).toEqual({ before: null, limit: 2 })
  expect((await engine.resume(response.continuation, [previous])).kind).toBe('completed')
  await expect(engine.resume(response.continuation, [previous])).rejects.toMatchObject({ code: 'invalid_continuation' })
  expect(model).toHaveBeenCalledTimes(2)
  expect((await repository.tasks.list({ page: 1, pageSize: 20 })).total).toBe(1)
  expect(await repository.remaining(actor, 10, timestamp)).toBe(9)
})
test('上下文预算丢弃最早历史、保留最新问题并标记长回复截断', async () => {
  const record = await signTurn(secret, actor, { id: crypto.randomUUID(), conversationId: crypto.randomUUID(), createdAt: timestamp - 100, user: '上次的问题', assistant: { id: crypto.randomUUID(), role: 'assistant', blocks: [{ type: 'text', text: '长'.repeat(1800) }], references: [] } })
  const history = Array.from({ length: 8 }, (_, i) => ({ ...record, id: crypto.randomUUID(), user: `历史问题${i}${'问'.repeat(490)}` }))
  const request = { requestId: crypto.randomUUID(), conversationId: record.conversationId, text: 'x'.repeat(500), page: { path: null }, history }
  const context = contextMessages({ request, groups: [] })
  expect(context.limited).toBe(true)
  expect(JSON.stringify(context.messages).length).toBeLessThanOrEqual(16_000)
  expect(context.messages[0]?.content).not.toContain('历史问题0')
  expect(context.messages[0]?.content).toContain(history.at(-1)!.user)
  expect(context.messages[0]?.content).toContain('历史摘要已截断')
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
test('无限工具循环触及单轮调用上限后终止', async () => {
  const model = vi.fn<NonNullable<EngineDependencies['model']>>(async () => ({ kind: 'tools', calls: [{ id: 'site', type: 'function', function: { name: 'get_site_info', arguments: '{"scope":"site"}' } }], usage: undefined }))
  const { engine, request } = await setup(model)
  await expect(engine.start(request)).rejects.toMatchObject({ code: 'call_limit' })
  expect(model).toHaveBeenCalledTimes(5)
})

test('审核拒绝停留审核阶段，取消后迟到模型响应不会完成任务，失败不扣日额度', async () => {
  const blocked = await setup(vi.fn(async () => final), async () => false)
  await expect(blocked.engine.start(blocked.request)).rejects.toMatchObject({ code: 'moderation_rejected' })
  expect(await blocked.repository.tasks.detail(blocked.request.requestId)).toMatchObject({ status: 'failed', stage: 'review', modelCalls: 0 })
  expect(await blocked.repository.remaining(actor, 10, timestamp)).toBe(10)
  const response = Promise.withResolvers<typeof final>()
  const started = Promise.withResolvers<void>()
  const model = vi.fn(async () => {
    started.resolve()
    return response.promise
  })
  const cancelled = await setup(model)
  const pending = cancelled.engine.start(cancelled.request)
  const assertion = expect(pending).rejects.toMatchObject({ code: 'request_inactive' })
  await started.promise
  await cancelled.repository.end(cancelled.request.requestId, actor, 'cancelled', null, timestamp + 100)
  response.resolve(final)
  await assertion
  expect(await cancelled.repository.tasks.detail(cancelled.request.requestId)).toMatchObject({ status: 'cancelled', stage: 'reply', finishedAt: timestamp + 100 })
  expect(await cancelled.repository.remaining(actor, 10, timestamp)).toBe(10)
})
