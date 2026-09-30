import type { H3Event } from 'h3'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { assistantTestRoute } from '../server/features/assistant/admin'
import { createAssistantRepository } from '../server/features/assistant/repository'
import { assistantCredentialsSchema, defaultAssistantSettings } from '../shared/assistant/settings'

const settings = { ...defaultAssistantSettings, baseUrl: 'https://model.example.com/v1', model: 'fixture', turnstileSiteKey: 'test-sitekey', inputPriceMicrosPerMillion: 100, outputPriceMicrosPerMillion: 100, moderationPriceMicros: 100 }
const state = vi.hoisted(() => ({ repository: null as ReturnType<typeof createAssistantRepository> | null }))
vi.mock('../server/features/auth/session', () => ({ requireOwner: async () => ({ user: { id: 'owner' } }) }))
vi.mock('../server/features/assistant/http', async original => ({
  ...await original<typeof import('../server/features/assistant/http')>(),
  assistantJson: async () => ({ version: 1 }),
  withAssistant: async (_event: H3Event, operation: (repo: ReturnType<typeof createAssistantRepository>) => Promise<unknown>) => operation(state.repository!),
  assistantConfiguration: async () => ({ settings, credentials: assistantCredentialsSchema.parse({ modelKey: 'test-key', aliyunKeyId: 'test-id', aliyunKeySecret: 'test-secret', turnstileSecret: 'test-turnstile' }), version: 1, secret: btoa('a'.repeat(32)), ready: false, verifiedHash: '' }),
}))
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

test.each([
  { name: 'NoPermission 返回可操作配置错误，停止后续调用并结算为零', denied: true, malformed: false, slow: false },
  { name: '仅开启内容合规与提示词攻击检测可通过完整能力测试', denied: false, malformed: false, slow: false },
  { name: '模型第二次响应字段不符合约定时返回字段诊断且不标记验证通过', denied: false, malformed: true, slow: false },
  { name: '两次模型各耗时 55 秒，整轮超过旧 90 秒后仍能通过且正常结算', denied: false, malformed: false, slow: true },
])('后台能力测试：$name', async ({ denied, malformed, slow }) => {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec(readFileSync(new URL('../migrations/admin/0006_assistant.sql', import.meta.url), 'utf8'))
    db.exec(readFileSync(new URL('../migrations/admin/0007_assistant_budget.sql', import.meta.url), 'utf8'))
    const repo = createAssistantRepository({ close() {}, async batch(statements) {
      db.exec('BEGIN IMMEDIATE')
      try {
        const rows = statements.map(item => db.prepare(item.sql).all(...(item.params ?? [])) as Record<string, unknown>[])
        db.exec('COMMIT')
        return rows
      }
      catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    } })
    state.repository = repo
    await repo.saveSettings(settings, '', 0, '')
    vi.stubGlobal('useRuntimeConfig', () => ({ adminEnabled: true }))
    const clear = { Code: 200, Data: { Suggestion: 'pass', Detail: [{ Type: 'contentModeration', Suggestion: 'pass' }, { Type: 'promptAttack', Suggestion: 'pass' }] } }
    const blocked = { Code: 200, Data: { Suggestion: 'block', Detail: [{ Type: 'contentModeration', Suggestion: 'pass' }, { Type: 'promptAttack', Suggestion: 'block' }] } }
    const usage = { prompt_tokens: 100, completion_tokens: 20 }
    const tool = { choices: [{ finish_reason: 'tool_calls', message: { role: 'assistant', content: null, tool_calls: [{ id: 'site', type: 'function', function: { name: 'get_site_info', arguments: '{"scope":"site"}' } }] } }], usage }
    const intent = malformed ? { PRIVATE_SECRET: 'PRIVATE_SECRET', articles: [], references: [], taxonomy: null } : { text: '个人技术博客。', articles: [], references: [], taxonomy: null }
    const final = { choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(intent) } }], usage }
    const replies = [clear, blocked, clear, tool, clear, clear, final, clear]
    const started = [Promise.withResolvers<void>(), Promise.withResolvers<void>()]
    let modelCalls = 0
    if (slow)
      vi.useFakeTimers()
    const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
      if (denied)
        return Response.json({ Code: 'NoPermission', Message: 'PRIVATE_SECRET' }, { status: 403 })
      const reply = replies.shift()
      if (!reply)
        throw new Error('Unexpected extra provider request')
      if (slow && 'choices' in reply) {
        started[modelCalls++]!.resolve()
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, 55_000)
          init?.signal?.addEventListener('abort', () => {
            clearTimeout(timer)
            reject(init.signal?.reason)
          }, { once: true })
        })
      }
      return Response.json(reply)
    })
    vi.stubGlobal('fetch', fetcher)
    const event = { method: 'POST', context: {} } as H3Event
    if (denied) {
      const error: unknown = await assistantTestRoute(event).catch(cause => cause)
      expect(error).toMatchObject({ statusCode: 422, code: 'moderation_permission_denied', message: expect.stringContaining('AliyunYundunGreenWebFullAccess') })
      expect(JSON.stringify(error)).not.toContain('PRIVATE_SECRET')
      expect(fetcher).toHaveBeenCalledTimes(1)
      expect(db.prepare('SELECT status, model_calls FROM assistant_requests').get()).toMatchObject({ status: 'failed', model_calls: 0 })
      expect(db.prepare('SELECT reserved_micros, spent_micros FROM assistant_daily_usage').get()).toMatchObject({ reserved_micros: 0, spent_micros: 0 })
      expect((await repo.settings()).verifiedHash).toBe('')
    }
    else if (malformed) {
      const error: unknown = await assistantTestRoute(event).catch(cause => cause)
      expect(error).toMatchObject({ statusCode: 422, code: 'invalid_model_response', message: expect.stringContaining('模型结构化回答测试：模型返回的 JSON 不符合回答约定（text：缺失或类型错误，应为字符串') })
      expect(JSON.stringify(error)).not.toContain('PRIVATE_SECRET')
      expect(fetcher).toHaveBeenCalledTimes(7)
      expect(db.prepare('SELECT status, model_calls FROM assistant_requests').get()).toMatchObject({ status: 'failed', model_calls: 2 })
      expect((await repo.settings()).verifiedHash).toBe('')
    }
    else {
      const checked = expect(assistantTestRoute(event)).resolves.toMatchObject({ message: expect.stringContaining('测试通过') })
      if (slow) {
        for (const call of started) {
          await call.promise
          await vi.advanceTimersByTimeAsync(55_000)
        }
      }
      await checked
      expect(fetcher).toHaveBeenCalledTimes(8)
      expect(db.prepare('SELECT status, model_calls FROM assistant_requests').get()).toMatchObject({ status: 'completed', model_calls: 2 })
      expect(db.prepare('SELECT reserved_micros, spent_micros FROM assistant_daily_usage').get()).toMatchObject({ reserved_micros: 0, spent_micros: 604 })
      expect((await repo.settings()).verifiedHash).not.toBe('')
    }
  }
  finally { db.close() }
})
