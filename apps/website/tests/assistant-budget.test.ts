import type { H3Event } from 'h3'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { assistantSettingsRoute, assistantUsageRoute } from '../server/features/assistant/admin'
import { configurationHash } from '../server/features/assistant/http'
import { billingDay, createAssistantRepository } from '../server/features/assistant/repository'
import { AdminError } from '../shared/admin/model'
import { assistantCredentialsSchema, defaultAssistantSettings } from '../shared/assistant/settings'

const credentials = assistantCredentialsSchema.parse({ modelKey: 'fixture', aliyunKeyId: 'fixture', aliyunKeySecret: 'fixture', turnstileSecret: 'fixture' })
const secret = btoa('a'.repeat(32))
const settings = { ...defaultAssistantSettings, enabled: true, baseUrl: 'https://model.example.com/v1', model: 'fixture', turnstileSiteKey: 'fixture', inputPriceMicrosPerMillion: 100, outputPriceMicrosPerMillion: 100, moderationPriceMicros: 10, dailyBudgetMicros: 100 }
const state = vi.hoisted(() => ({ repository: null as ReturnType<typeof createAssistantRepository> | null, body: {} as unknown, authorized: true }))
vi.mock('../server/features/auth/session', () => ({ requireOwner: async () => {
  if (!state.authorized)
    throw new AdminError(403, '仅管理员可以访问后台')
  return { user: { id: 'owner' } }
} }))
vi.mock('../server/features/assistant/http', async (original) => {
  const actual = await original<typeof import('../server/features/assistant/http')>()
  return {
    ...actual,
    assistantJson: async () => state.body,
    assistantSecret: () => secret,
    withAssistant: async (_event: H3Event, operation: (repo: ReturnType<typeof createAssistantRepository>) => Promise<unknown>) => operation(state.repository!),
    assistantConfiguration: async () => {
      const stored = await state.repository!.settings()
      return { ...stored, credentials, secret, ready: stored.verifiedHash === await actual.configurationHash(stored.settings, credentials) }
    },
  }
})

const databases: DatabaseSync[] = []
const now = Date.parse('2026-09-30T10:00:00Z')
const event = (method: string) => ({ method, context: {} }) as H3Event
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  for (const db of databases.splice(0)) db.close()
})
async function setup() {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(now)
  vi.stubGlobal('useRuntimeConfig', () => ({ adminEnabled: true }))
  state.authorized = true
  const db = new DatabaseSync(':memory:')
  databases.push(db)
  db.exec('PRAGMA foreign_keys = ON')
  for (const migration of ['0006_assistant.sql', '0007_assistant_budget.sql'])
    db.exec(readFileSync(new URL(`../migrations/admin/${migration}`, import.meta.url), 'utf8'))
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
  await repo.saveSettings(settings, '', 0, await configurationHash(settings, credentials))
  const request = { id: crypto.randomUUID(), actor: 'guest', ipHash: 'ip', conversationId: crypto.randomUUID(), fingerprint: 'x', authenticated: false }
  await repo.admit(request, settings, now)
  const charge = async (amount: number) => {
    const id = crypto.randomUUID()
    await repo.reserve({ id, requestId: request.id, actor: request.actor, kind: 'moderation', amount }, settings.dailyBudgetMicros, now)
    return id
  }
  return { db, repo, charge }
}

test('每日进度包含预留；重置释放已结算额度并保留费用记录、在途预留和迟到结算', async () => {
  const { db, repo, charge } = await setup()
  const settled = await charge(80)
  await repo.settle(settled, 60)
  const pending = await charge(40)
  await expect(charge(1)).rejects.toMatchObject({ code: 'budget_limit' })
  expect(await assistantUsageRoute(event('GET'))).toEqual({ day: billingDay(now), limitMicros: 100, spentMicros: 60, reservedMicros: 40, totalSpentMicros: 60, resetMicros: 0 })

  state.body = { day: billingDay(now), resetMicros: 0 }
  expect(await assistantUsageRoute(event('POST'))).toMatchObject({ spentMicros: 0, reservedMicros: 40, totalSpentMicros: 60, resetMicros: 60 })
  expect(db.prepare('SELECT spent_micros FROM assistant_charges WHERE id = ?').get(settled)).toEqual({ spent_micros: 60 })
  expect(db.prepare('SELECT released_micros FROM assistant_budget_resets').all()).toEqual([{ released_micros: 60 }])
  await charge(60)
  await expect(charge(1)).rejects.toMatchObject({ code: 'budget_limit' })
  await repo.settle(pending, 20)
  expect(await repo.usage(billingDay(now))).toEqual({ reserved_micros: 60, spent_micros: 20 })
  await expect(assistantUsageRoute(event('POST'))).rejects.toMatchObject({ code: 'budget_reset_conflict' })
  expect(await repo.usage(billingDay(now))).toEqual({ reserved_micros: 60, spent_micros: 20 })

  state.body = { day: billingDay(now), resetMicros: 60 }
  expect(await assistantUsageRoute(event('POST'))).toMatchObject({ spentMicros: 0, reservedMicros: 60, totalSpentMicros: 80, resetMicros: 80 })
  expect(db.prepare('SELECT SUM(released_micros) AS released FROM assistant_budget_resets').get()).toEqual({ released: 80 })
  expect((await repo.settings()).verifiedHash).not.toBe('')
})

test('额度按上海自然日切换，过期确认不能重置新一天或旧账', async () => {
  const { repo, charge } = await setup()
  await repo.settle(await charge(80), null)
  state.body = { day: billingDay(now), resetMicros: 0 }
  vi.setSystemTime(Date.parse('2026-09-30T16:00:00Z'))
  await expect(assistantUsageRoute(event('POST'))).rejects.toMatchObject({ code: 'budget_day_changed' })
  expect(await assistantUsageRoute(event('GET'))).toMatchObject({ day: '2026-10-01', spentMicros: 0, reservedMicros: 0 })
  expect(await repo.usage('2026-09-30')).toMatchObject({ spent_micros: 80 })
})

test('仅预留没有已结算额度时不能重置；未授权与非法输入无法修改账本', async () => {
  const { db, charge } = await setup()
  await charge(100)
  state.body = { day: billingDay(now), resetMicros: 0 }
  await expect(assistantUsageRoute(event('POST'))).rejects.toMatchObject({ code: 'budget_reset_conflict' })
  state.body = { day: billingDay(now), resetMicros: -1 }
  await expect(assistantUsageRoute(event('POST'))).rejects.toThrow()
  state.authorized = false
  await expect(assistantUsageRoute(event('POST'))).rejects.toMatchObject({ statusCode: 403 })
  await expect(assistantUsageRoute(event('GET'))).rejects.toMatchObject({ statusCode: 403 })
  expect(db.prepare('SELECT reserved_micros, spent_micros, reset_micros FROM assistant_daily_usage').get()).toEqual({ reserved_micros: 100, spent_micros: 0, reset_micros: 0 })
  expect(db.prepare('SELECT COUNT(*) AS count FROM assistant_budget_resets').get()).toEqual({ count: 0 })
})

test('单独修改额度上限保留验证，模型设置变化仍必须重新测试', async () => {
  const { repo } = await setup()
  const fetcher = vi.fn()
  vi.stubGlobal('fetch', fetcher)
  state.body = { version: 1, settings: { ...settings, dailyBudgetMicros: 200 } }
  expect(await assistantSettingsRoute(event('PUT'))).toMatchObject({ verified: true, settings: { enabled: true, dailyBudgetMicros: 200 }, version: 2 })
  expect((await repo.settings()).verifiedHash).toBe(await configurationHash({ ...settings, dailyBudgetMicros: 200 }, credentials))
  state.body = { version: 2, settings: { ...settings, dailyBudgetMicros: 300, model: 'changed' } }
  await expect(assistantSettingsRoute(event('PUT'))).rejects.toMatchObject({ code: 'not_verified' })
  expect(fetcher).not.toHaveBeenCalled()
})

test('额度迁移保留既有累计结算和预留，不自动重置', () => {
  const db = new DatabaseSync(':memory:')
  databases.push(db)
  db.exec(readFileSync(new URL('../migrations/admin/0006_assistant.sql', import.meta.url), 'utf8'))
  db.exec('INSERT INTO assistant_daily_usage(day,spent_micros,reserved_micros) VALUES (\'2026-09-30\',70,20)')
  db.exec(readFileSync(new URL('../migrations/admin/0007_assistant_budget.sql', import.meta.url), 'utf8'))
  expect(db.prepare('SELECT spent_micros, reserved_micros, reset_micros FROM assistant_daily_usage').get()).toEqual({ spent_micros: 70, reserved_micros: 20, reset_micros: 0 })
})
