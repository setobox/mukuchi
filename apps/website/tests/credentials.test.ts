import type { H3Event } from 'h3'
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { revealCredential } from '../server/features/ai/credentials'
import { encryptApiKey } from '../server/features/ai/crypto'
import { AdminError } from '../shared/admin/model'

const state = vi.hoisted(() => ({ body: { field: 'apiKey' }, status: 0, encryptedKey: '', credentials: { modelKey: 'model-fixture', aliyunKeyId: 'aliyun-id', aliyunKeySecret: 'aliyun-secret', turnstileSecret: 'turnstile-secret' } }))
const authorize = vi.hoisted(() => vi.fn(async () => {
  if (state.status)
    throw new AdminError(state.status, '未授权')
}))
vi.mock('../server/features/auth/session', () => ({ requireOwner: authorize }))
vi.mock('../server/features/admin/http', () => ({ readAdminJson: async () => state.body, withAdmin: vi.fn() }))
vi.mock('../server/features/ai/service', () => ({ withAi: async (_event: H3Event, operation: (repo: { settings: () => Promise<{ encryptedKey: string }> }) => unknown) => operation({ settings: async () => ({ encryptedKey: state.encryptedKey }) }) }))
vi.mock('../server/features/assistant/http', () => ({ withAssistant: async (_event: H3Event, operation: (repo: object) => unknown) => operation({}), assistantConfiguration: async () => ({ credentials: state.credentials }) }))
afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  state.status = 0
})

test('密钥仅按指定字段解密读取，读取使用已有管理员校验并禁止缓存', async () => {
  const secret = btoa('a'.repeat(32))
  const headers = vi.fn()
  vi.stubGlobal('useRuntimeConfig', () => ({ aiEncryptionKey: secret }))
  vi.stubGlobal('setResponseHeader', headers)
  state.encryptedKey = await encryptApiKey('summary-fixture', secret)
  state.body = { field: 'apiKey' }
  const event = { method: 'POST' } as H3Event
  expect(await revealCredential(event, 'ai')).toEqual({ field: 'apiKey', value: 'summary-fixture' })
  expect(authorize).toHaveBeenCalledWith(event)
  expect(headers).toHaveBeenCalledWith(event, 'cache-control', 'private, no-store')
  for (const field of Object.keys(state.credentials)) {
    state.body = { field }
    const result = await revealCredential(event, 'assistant')
    expect(Object.keys(result)).toEqual(['field', 'value'])
    expect(result.value).toBe(state.credentials[field as keyof typeof state.credentials])
  }
  state.body = { field: 'apiKey' }
  await expect(revealCredential(event, 'assistant')).rejects.toMatchObject({ statusCode: 400 })
})

test.each([401, 403])('鉴权失败 %s 时不读取任何密钥', async (status) => {
  state.status = status
  await expect(revealCredential({ method: 'POST' } as H3Event, 'ai')).rejects.toMatchObject({ statusCode: status })
})
