import type { H3Event } from 'h3'
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test'
import { assistantEnabled, assistantIdentity, assistantJson, defineAssistantHandler, trustedClientIp } from '../server/features/assistant/http'

const current = vi.hoisted(() => ({ session: null as null | { user: { id: string }, csrf: string } }))
vi.mock('../server/features/auth/session', () => ({ session: async () => current.session }))
const event = { context: {}, node: { req: { socket: { remoteAddress: '127.0.0.1' } } } } as unknown as H3Event
const config = { assistantEnabled: true, aiEncryptionKey: btoa('a'.repeat(32)), public: { authEnabled: false }, app: { baseURL: '/blog/' } }
const cookies = new Map<string, string>()
const headers = new Map<string, string>()
const setCookie = vi.fn((_event: H3Event, name: string, value: string, _options: unknown) => cookies.set(name, value))
let body = '{}'
beforeEach(() => {
  current.session = null
  config.public.authEnabled = false
  config.assistantEnabled = true
  cookies.clear()
  headers.clear()
  headers.set('origin', 'https://blog.test')
  headers.set('content-type', 'application/json')
  body = '{}'
  vi.stubGlobal('useRuntimeConfig', () => config)
  vi.stubGlobal('getCookie', (_event: H3Event, name: string) => cookies.get(name))
  vi.stubGlobal('setCookie', setCookie)
  vi.stubGlobal('getHeader', (_event: H3Event, name: string) => headers.get(name))
  vi.stubGlobal('getRequestURL', () => new URL('https://blog.test/blog/api/assistant/turns'))
  vi.stubGlobal('getRequestWebStream', () => new Response(body).body)
  vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
  vi.stubGlobal('setResponseHeader', vi.fn())
  vi.stubGlobal('setResponseStatus', vi.fn())
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

test('匿名身份使用签名 HttpOnly Cookie；写操作要求同源和绑定的 CSRF', async () => {
  const first = await assistantIdentity(event)
  expect(first.namespace).toBe('anonymous')
  expect(setCookie).toHaveBeenCalledWith(event, 'setobox:assistant:v1', expect.any(String), expect.objectContaining({ httpOnly: true, secure: true, sameSite: 'lax', path: '/blog/' }))
  expect(await assistantIdentity(event)).toEqual(first)
  await expect(assistantIdentity(event, true)).rejects.toMatchObject({ statusCode: 403 })
  headers.set('x-csrf-token', first.csrf)
  expect(await assistantIdentity(event, true)).toEqual(first)
  headers.set('origin', 'https://attacker.test')
  await expect(assistantIdentity(event, true)).rejects.toMatchObject({ statusCode: 403 })
  headers.set('origin', 'https://blog.test')
  cookies.set('setobox:assistant:v1', `${crypto.randomUUID()}.forged`)
  await expect(assistantIdentity(event, true)).rejects.toMatchObject({ statusCode: 403 })
})

test('账号与匿名隔离，登录后旧匿名 CSRF 不能提交请求', async () => {
  const guest = await assistantIdentity(event)
  config.public.authEnabled = true
  current.session = { user: { id: 'user-a' }, csrf: 'account-csrf' }
  const account = await assistantIdentity(event)
  expect(account.namespace).toMatch(/^account:/)
  expect(account.authenticated).toBe(true)
  expect(account.actor).not.toContain('user-a')
  headers.set('x-csrf-token', guest.csrf)
  await expect(assistantIdentity(event, true)).rejects.toMatchObject({ statusCode: 403 })
  headers.set('x-csrf-token', 'account-csrf')
  expect(await assistantIdentity(event, true)).toEqual(account)
})

test('JSON 按实际字节限制，Content-Length 缺失也不能绕过；错误不暴露供应商细节', async () => {
  body = JSON.stringify({ text: '文'.repeat(22_000) })
  await expect(assistantJson(event)).rejects.toMatchObject({ statusCode: 413 })
  body = '{'
  await expect(assistantJson(event)).rejects.toMatchObject({ statusCode: 400 })
  headers.set('content-type', 'text/plain')
  await expect(assistantJson(event)).rejects.toMatchObject({ statusCode: 415 })
  const handler = defineAssistantHandler(() => {
    throw new Error('secret-provider-response')
  })
  expect(await handler(event)).toEqual({ kind: 'rejected', code: 'assistant_unavailable', message: '助手暂不可用，请稍后重试' })
  expect(setResponseHeader).toHaveBeenCalledWith(event, 'cache-control', 'private, no-store')
})

test('Node 不信任代理头，Worker 使用平台 IP；助手开关独立于账号功能', () => {
  headers.set('cf-connecting-ip', '198.51.100.1')
  expect(trustedClientIp(event)).toBe('127.0.0.1')
  expect(trustedClientIp({ ...event, context: { cloudflare: {} } } as unknown as H3Event)).toBe('198.51.100.1')
  expect(assistantEnabled(event)).toBe(true)
  config.assistantEnabled = false
  expect(assistantEnabled(event)).toBe(false)
})
