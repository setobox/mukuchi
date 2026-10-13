import type { H3Event } from 'h3'
import type { AssistantRepository } from '../server/features/assistant/repository'
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test'
import { signTurn, verifyHistory } from '../server/features/assistant/crypto'
import { conversationsRoute, importHistoryRoute, messagesRoute, removeHistoryRoute, restoreHistoryRoute } from '../server/features/assistant/history-service'
import { assistantIdentity } from '../server/features/assistant/http'
import { assistantDatabase } from './fixtures/assistant-database'

const current = vi.hoisted(() => ({ session: null as null | { user: { id: string }, csrf: string }, repository: null as AssistantRepository | null }))
vi.mock('../server/features/auth/session', () => ({ session: async () => current.session }))
vi.mock('../server/features/assistant/http', async original => ({
  ...await original<typeof import('../server/features/assistant/http')>(),
  withAssistant: async (_event: H3Event, operation: (repository: AssistantRepository) => Promise<unknown>) => operation(current.repository!),
}))
const event = { context: {}, node: { req: { socket: { remoteAddress: '127.0.0.1' } } } } as unknown as H3Event
const secret = btoa('a'.repeat(32))
const cookies = new Map<string, string>()
const headers = new Map<string, string>()
let body: unknown
let conversationId: string
let connection: ReturnType<typeof assistantDatabase>
beforeEach(() => {
  connection = assistantDatabase()
  current.repository = connection.repository
  current.session = null
  cookies.clear()
  headers.clear()
  headers.set('origin', 'https://blog.test')
  headers.set('content-type', 'application/json')
  body = {}
  conversationId = crypto.randomUUID()
  vi.stubGlobal('useRuntimeConfig', () => ({ aiEncryptionKey: secret, app: { baseURL: '/' } }))
  vi.stubGlobal('getCookie', (_event: H3Event, name: string) => cookies.get(name))
  vi.stubGlobal('setCookie', (_event: H3Event, name: string, value: string) => cookies.set(name, value))
  vi.stubGlobal('getHeader', (_event: H3Event, name: string) => headers.get(name))
  vi.stubGlobal('getRequestURL', () => new URL('https://blog.test/api/assistant/conversations'))
  vi.stubGlobal('getRequestWebStream', () => new Response(JSON.stringify(body)).body)
  vi.stubGlobal('getQuery', () => ({}))
  vi.stubGlobal('getRouterParam', () => conversationId)
})
afterEach(() => {
  connection.connection.close()
  vi.unstubAllGlobals()
})
async function login(id = 'a') {
  current.session = { user: { id }, csrf: 'account-csrf' }
  headers.set('x-csrf-token', 'account-csrf')
  return assistantIdentity(event)
}
test('云端历史拒绝游客读取，所有写入验证同源和账号 CSRF，不接受客户端身份字段', async () => {
  await expect(conversationsRoute(event)).rejects.toMatchObject({ statusCode: 401 })
  await login()
  body = { version: 1 }
  headers.set('origin', 'https://attacker.test')
  await expect(removeHistoryRoute(event)).rejects.toMatchObject({ statusCode: 403 })
  headers.set('origin', 'https://blog.test')
  headers.set('x-csrf-token', 'wrong')
  await expect(removeHistoryRoute(event)).rejects.toMatchObject({ statusCode: 403 })
  headers.set('x-csrf-token', 'account-csrf')
  body = { source: 'account', conversationId, records: [], messages: [], actor: 'account:other' }
  await expect(importHistoryRoute(event)).rejects.toThrow()
})
test('登录迁移验证游客 Cookie 签名并重签账号；重复导入不重复创建，切换账号不可读取或认领', async () => {
  const guest = await assistantIdentity(event)
  const record = await signTurn(secret, guest.actor, { id: crypto.randomUUID(), conversationId, createdAt: 1, user: '游客问题', assistant: { id: crypto.randomUUID(), role: 'assistant', blocks: [{ type: 'text', text: '回答' }], references: [] } })
  const account = await login()
  body = { source: 'anonymous', conversationId, records: [record] }
  await importHistoryRoute(event)
  await importHistoryRoute(event)
  const detail = await connection.repository.history.messages(account.actor, conversationId, null)
  expect(detail.messages).toHaveLength(1)
  await verifyHistory(secret, account.actor, conversationId, [detail.messages[0]!.record!])
  expect(await connection.repository.remaining(account.actor, 50, Date.now())).toBe(50)
  await login('b')
  await expect(messagesRoute(event)).rejects.toMatchObject({ statusCode: 404 })
  await expect(importHistoryRoute(event)).rejects.toMatchObject({ code: 'history_claimed' })
})
test('篡改签名、伪造匿名 Cookie 和过期删除版本均被拒绝；撤销验证账号签名', async () => {
  const guest = await assistantIdentity(event)
  const record = await signTurn(secret, guest.actor, { id: crypto.randomUUID(), conversationId, createdAt: 1, user: '问题', assistant: { id: crypto.randomUUID(), role: 'assistant', blocks: [{ type: 'text', text: '回答' }], references: [] } })
  const account = await login()
  body = { source: 'anonymous', conversationId, records: [{ ...record, user: '篡改' }] }
  await expect(importHistoryRoute(event)).rejects.toMatchObject({ code: 'invalid_history' })
  const cookie = cookies.get('setobox:assistant:v1')!
  cookies.set('setobox:assistant:v1', `${crypto.randomUUID()}.forged`)
  body = { source: 'anonymous', conversationId, records: [record] }
  await expect(importHistoryRoute(event)).rejects.toThrow()
  cookies.set('setobox:assistant:v1', cookie)
  await importHistoryRoute(event)
  const detail = await connection.repository.history.messages(account.actor, conversationId, null)
  body = { version: detail.conversation.version }
  await removeHistoryRoute(event)
  await expect(removeHistoryRoute(event)).rejects.toMatchObject({ code: 'history_conflict' })
  body = { version: detail.conversation.version + 1, records: [record] }
  await expect(restoreHistoryRoute(event)).rejects.toMatchObject({ code: 'invalid_history' })
  body = { version: detail.conversation.version + 1, records: [detail.messages[0]!.record!] }
  await restoreHistoryRoute(event)
  expect((await connection.repository.history.messages(account.actor, conversationId, null)).messages).toHaveLength(1)
})
