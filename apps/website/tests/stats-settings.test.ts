import type { H3Event } from 'h3'
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { statsSettings, statsSettingsRoute } from '../server/features/stats/settings'
import { AdminError } from '../shared/admin/model'
import { assistantDatabase } from './fixtures/assistant-database'

const state = vi.hoisted(() => ({ body: {} as unknown, query: vi.fn(), authorized: true }))
vi.mock('../server/features/admin/http', () => ({ readAdminJson: async () => state.body, withAdmin: async (_event: H3Event, operation: (repository: { query: typeof state.query }) => unknown) => operation({ query: state.query }) }))
vi.mock('../server/features/auth/session', () => ({ requireOwner: async () => {
  if (!state.authorized)
    throw new AdminError(403, '无权限')
} }))
afterEach(() => {
  vi.unstubAllGlobals()
  state.authorized = true
})
test('统计默认开启；后台可立即关闭和重新开启，冲突与非管理员写入被拒绝', async () => {
  const { db, connection } = assistantDatabase()
  const event = { method: 'PUT' } as H3Event
  vi.stubGlobal('useRuntimeConfig', () => ({ statsHashSecret: 'a'.repeat(32), public: { statsEnabled: false } }))
  state.query.mockImplementation(async (sql: string, params: (string | number)[] = []) => db.prepare(sql).all(...params))
  try {
    expect(await statsSettings(event)).toEqual({ enabled: true, version: 1 })
    state.body = { enabled: false, version: 1 }
    expect(await statsSettingsRoute(event)).toEqual({ enabled: false, version: 2 })
    await expect(statsSettingsRoute(event)).rejects.toMatchObject({ statusCode: 409 })
    state.body = { enabled: true, version: 2 }
    expect(await statsSettingsRoute(event)).toEqual({ enabled: true, version: 3 })
    state.authorized = false
    await expect(statsSettingsRoute(event)).rejects.toMatchObject({ statusCode: 403 })
  }
  finally { connection.close() }
})
