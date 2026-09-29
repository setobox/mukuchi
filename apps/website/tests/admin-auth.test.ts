import type { H3Event } from 'h3'
import type { AdminDatabase } from '../server/features/admin/database'
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test'
import { finishOAuth, startLogin, startOAuth } from '../server/features/auth/oauth'
import * as providers from '../server/features/auth/providers'
import { createSession, logout, requireOwner, session, sessionCookie } from '../server/features/auth/session'
import { beginVerification, keyedDigest, resendVerification, sendVerification, verificationInfo, verifyEmail } from '../server/features/auth/verification'
import { sha256 } from '../shared/admin/model'
import { adminEmails, profileSchema, safeReturnTo } from '../shared/auth/model'
import { authDatabase, githubProfile } from './fixtures/auth'

const state = vi.hoisted(() => ({ db: null as AdminDatabase | null }))
vi.mock('#admin-driver', () => ({ openDatabase: () => ({ batch: state.db!.batch, close() {} }), openStorage: vi.fn() }))
const cookies = new Map<string, string>()
const headers = new Map<string, string>()
let fixture: ReturnType<typeof authDatabase>
let query: Record<string, string> = {}
let body: unknown
let config: Record<string, unknown>
const event = { method: 'GET', context: {}, node: { req: { socket: { remoteAddress: '127.0.0.1' } } } } as H3Event
const setCookie = vi.fn((_event: H3Event, name: string, value: string) => cookies.set(name, value))
beforeEach(() => {
  fixture = authDatabase()
  state.db = fixture.db
  cookies.clear()
  headers.clear()
  headers.set('origin', 'https://blog.test')
  headers.set('content-type', 'application/json')
  query = {}
  body = {}
  event.method = 'GET'
  config = { authAdminEmails: ' Owner@Example.com ', authSecret: 'secret-'.repeat(8), resendApiKey: 'test-mail-secret', authEmailFrom: 'Blog <noreply@example.com>', app: { baseURL: '/' }, public: { siteUrl: 'https://blog.test' }, githubClientId: 'github-client', githubClientSecret: 'github-secret', googleClientId: 'google-client', googleClientSecret: 'google-secret' }
  vi.stubGlobal('useRuntimeConfig', () => config)
  vi.stubGlobal('getCookie', (_event: H3Event, name: string) => cookies.get(name))
  vi.stubGlobal('setCookie', setCookie)
  vi.stubGlobal('deleteCookie', (_event: H3Event, name: string) => cookies.delete(name))
  vi.stubGlobal('getHeader', (_event: H3Event, name: string) => headers.get(name))
  vi.stubGlobal('getRequestURL', () => new URL('https://blog.test/api/auth/callback'))
  vi.stubGlobal('getQuery', () => query)
  vi.stubGlobal('getRequestWebStream', () => new Response(JSON.stringify(body)).body)
  vi.stubGlobal('sendRedirect', (_event: H3Event, url: string) => url)
})
afterEach(() => {
  fixture.db.close()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})
async function login(owner = true) {
  const user = await fixture.repo.resolve({ ...githubProfile, subject: owner ? '123' : '456', email: owner ? githubProfile.email : 'reader@example.com' })
  await createSession(event, user.id)
  headers.set('x-csrf-token', (await session(event))!.csrf)
  return user
}
function redirect(value: unknown) {
  return new URL(String(value), 'https://blog.test')
}

test('首次注册持久用户，同邮箱跨平台归并；并发回调不重复，绑定身份优先且不随平台改邮箱', async () => {
  const profile = profileSchema.parse({ ...githubProfile, email: ' OWNER@Example.COM ' })
  const users = await Promise.all([fixture.repo.resolve(profile), fixture.repo.resolve(profile), fixture.repo.resolve({ ...profile, provider: 'google', subject: 'google-1' })])
  expect(new Set(users.map(user => user.id)).size).toBe(1)
  expect(await fixture.repo.providers(users[0]!.id)).toEqual(['github', 'google'])
  const changed = await fixture.repo.resolve({ ...profile, email: 'changed@example.com', name: 'New name' })
  expect(changed).toMatchObject({ id: users[0]!.id, email: 'owner@example.com', name: 'New name' })
  expect(await fixture.repo.query('SELECT * FROM auth_users')).toHaveLength(1)
  await expect(fixture.repo.resolve({ ...profile, subject: 'other-github' })).rejects.toMatchObject({ code: 'conflict' })
})
test('管理员按已验证邮箱实时判定；普通用户拒绝、会话只存摘要、退出后撤销', async () => {
  await login(false)
  await expect(requireOwner(event)).rejects.toMatchObject({ statusCode: 403 })
  await login()
  const token = cookies.get(sessionCookie)!
  expect(await fixture.repo.session(token)).toBeNull()
  expect(await fixture.repo.session(await sha256(token))).not.toBeNull()
  expect(setCookie.mock.calls.at(-1)).toMatchObject({ 3: { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 604800 } })
  await expect(requireOwner(event)).resolves.toMatchObject({ user: { role: 'admin' } })
  config.authAdminEmails = ''
  await expect(requireOwner(event)).rejects.toMatchObject({ statusCode: 403 })
  config.authAdminEmails = 'owner@example.com'
  event.method = 'POST'
  headers.delete('x-csrf-token')
  await expect(requireOwner(event)).rejects.toMatchObject({ statusCode: 403 })
  await expect(logout(event)).rejects.toMatchObject({ statusCode: 403 })
  headers.set('x-csrf-token', (await session(event))!.csrf)
  headers.set('origin', 'https://evil.test')
  await expect(logout(event)).rejects.toMatchObject({ statusCode: 403 })
  headers.set('origin', 'https://blog.test')
  await logout(event)
  cookies.set(sessionCookie, token)
  expect(await session(event)).toBeNull()
})
test('旧、过期和生产本地会话无效', async () => {
  cookies.set('mukuchi:session', 'legacy')
  expect(await session(event)).toBeNull()
  await login()
  await fixture.repo.query('UPDATE auth_sessions SET expires_at = 0')
  expect(await session(event)).toBeNull()
  await createSession(event, null)
  expect(await session(event)).toBeNull()
})
test('GitHub 获取私有主邮箱，PKCE 与单次 state 绑定浏览器和原页面，管理员不自动跳后台', async () => {
  query = { returnTo: '/posts/example?q=1#section' }
  const target = redirect(await startOAuth(event))
  expect(target.searchParams.get('redirect_uri')).toBe('https://blog.test/api/auth/callback')
  expect(target.searchParams.get('code_challenge_method')).toBe('S256')
  expect(target.searchParams.get('scope')).toBe('user:email')
  const oauthState = target.searchParams.get('state')!
  query = { state: crypto.randomUUID(), code: 'code' }
  expect(redirect(await finishOAuth(event)).searchParams.get('auth_error')).toBe('expired')
  query.state = oauthState
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ access_token: 'token' })).mockResolvedValueOnce(Response.json({ id: 123, login: 'owner' })).mockResolvedValueOnce(Response.json([{ email: 'Owner@example.com', primary: true, verified: true, visibility: 'private' }]))
  vi.stubGlobal('fetch', request)
  expect(await finishOAuth(event)).toBe('/posts/example?q=1#section')
  expect(await session(event)).toMatchObject({ user: { role: 'admin', email: 'owner@example.com', avatar: '' }, loginProvider: 'github' })
  expect(new URLSearchParams(String(request.mock.calls[0]![1]?.body)).get('code_verifier')).toHaveLength(64)
  expect(request.mock.calls.every(call => call[1]?.redirect === 'manual')).toBe(true)
  cookies.set('mukuchi:oauth:github', oauthState)
  expect(redirect(await finishOAuth(event)).searchParams.get('auth_error')).toBe('expired')
  expect(request).toHaveBeenCalledTimes(3)
})
test('拒绝缺少验证邮箱、授权取消、过期及平台混用', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ access_token: 'token' })).mockResolvedValueOnce(Response.json({ id: 123, login: 'owner' })).mockResolvedValueOnce(Response.json([{ email: 'owner@example.com', primary: true, verified: false }]))
  vi.stubGlobal('fetch', fetcher)
  await startOAuth(event)
  query = { state: cookies.get('mukuchi:oauth:github')!, code: 'code' }
  expect(redirect(await finishOAuth(event)).searchParams.get('auth_error')).toBe('email')
  await startOAuth(event)
  query = { state: cookies.get('mukuchi:oauth:github')!, error: 'access_denied' }
  expect(redirect(await finishOAuth(event)).searchParams.get('auth_error')).toBe('cancelled')
  await startOAuth(event)
  query = { state: cookies.get('mukuchi:oauth:github')!, code: 'code' }
  cookies.set('mukuchi:oauth:google', query.state)
  expect(redirect(await finishOAuth(event, 'google')).searchParams.get('auth_error')).toBe('expired')
  await fixture.repo.query('UPDATE auth_oauth SET expires_at = 0')
  expect(redirect(await finishOAuth(event)).searchParams.get('auth_error')).toBe('expired')
})

test('登录入口不可用时返回原页面的登录弹窗，过滤外部回跳', async () => {
  config.googleClientSecret = ''
  query = { returnTo: '/about' }
  expect(await startLogin(event, 'google')).toBe('/about?auth=login&auth_error=unavailable')
  query.returnTo = '//evil.test'
  expect(await startLogin(event, 'google')).toBe('/posts?auth=login&auth_error=unavailable')
})
test('Google 首次登录自动注册；第三方邮箱碰撞要求原账号登录，手动关联校验会话与邮箱', async () => {
  const profile = { ...githubProfile, provider: 'google' as const, subject: 'google-1', email: 'owner@gmail.com' }
  const exchange = vi.spyOn(providers, 'exchangeProfile').mockResolvedValue(profile)
  const target = redirect(await startOAuth(event, 'google'))
  expect(target.searchParams.get('scope')).toBe('openid email profile')
  expect(target.searchParams.get('nonce')).toBeTruthy()
  query = { state: cookies.get('mukuchi:oauth:google')!, code: 'google-code' }
  await finishOAuth(event, 'google')
  expect((await session(event))!.loginProvider).toBe('google')
  const googleUser = (await session(event))!.user
  await startOAuth(event, 'google')
  query = { state: cookies.get('mukuchi:oauth:google')!, code: 'again' }
  await finishOAuth(event, 'google')
  expect((await session(event))!.user.id).toBe(googleUser.id)
  const owner = await login()
  exchange.mockResolvedValue({ ...profile, subject: 'google-external', email: owner.email, trustedEmail: false })
  await startOAuth(event, 'google')
  query = { state: cookies.get('mukuchi:oauth:google')!, code: 'collision' }
  expect(redirect(await finishOAuth(event, 'google')).searchParams.get('auth_error')).toBe('link')
  event.method = 'POST'
  body = { returnTo: '/about' }
  headers.set('x-csrf-token', 'wrong')
  await expect(startOAuth(event, 'google', true)).rejects.toMatchObject({ statusCode: 403 })
  headers.set('x-csrf-token', (await session(event))!.csrf)
  await startOAuth(event, 'google', true)
  query = { state: cookies.get('mukuchi:oauth:google')!, code: 'link' }
  expect(await finishOAuth(event, 'google')).toBe('/about?auth=linked')
  expect(await fixture.repo.providers(owner.id)).toEqual(['github', 'google'])
  await expect(fixture.repo.link(owner.id, profile)).rejects.toMatchObject({ code: 'conflict' })
})
test('关联回调拒绝会话切换及邮箱不一致', async () => {
  await login()
  event.method = 'POST'
  body = {}
  const exchange = vi.spyOn(providers, 'exchangeProfile').mockResolvedValue({ ...githubProfile, provider: 'google', subject: 'g', email: 'other@example.com' })
  await startOAuth(event, 'google', true)
  query = { state: cookies.get('mukuchi:oauth:google')!, code: 'link' }
  expect(redirect(await finishOAuth(event, 'google')).searchParams.get('auth_error')).toBe('mismatch')
  exchange.mockResolvedValue({ ...githubProfile, provider: 'google', subject: 'g' })
  await startOAuth(event, 'google', true)
  query = { state: cookies.get('mukuchi:oauth:google')!, code: 'link' }
  await login(false)
  expect(redirect(await finishOAuth(event, 'google')).searchParams.get('auth_error')).toBe('expired')
})
async function pending(email = 'new@qq.com') {
  const hash = await beginVerification(event, { ...githubProfile, provider: 'google', subject: email, email, trustedEmail: false }, '/posts/original')
  const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ id: 'mail-id' }))
  vi.stubGlobal('fetch', request)
  await sendVerification(event, hash)
  const mail = JSON.parse(String(request.mock.calls[0]![1]?.body)) as { text: string }
  const code = mail.text.match(/\d{6}/)![0]
  headers.set('x-csrf-token', (await verificationInfo(event))!.csrf)
  event.method = 'POST'
  return { hash, code, request }
}

test('Google 第三方邮箱回调进入待注册状态，验证码完成后返回发起页面并持久关联身份', async () => {
  vi.spyOn(providers, 'exchangeProfile').mockResolvedValue({ ...githubProfile, provider: 'google', subject: 'external-new', email: 'new@qq.com', trustedEmail: false })
  const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ id: 'mail-id' }))
  vi.stubGlobal('fetch', request)
  query = { returnTo: '/about' }
  await startOAuth(event, 'google')
  query = { state: cookies.get('mukuchi:oauth:google')!, code: 'external' }
  expect(await finishOAuth(event, 'google')).toBe('/about?auth=verify')
  expect(await session(event)).toBeNull()
  expect(await fixture.repo.query('SELECT * FROM auth_users')).toHaveLength(0)
  const pending = (await verificationInfo(event))!
  expect(pending.email).toBe('new@qq.com')
  headers.set('x-csrf-token', pending.csrf)
  const mail = JSON.parse(String(request.mock.calls[0]![1]?.body)) as { text: string }
  body = { code: mail.text.match(/\d{6}/)![0] }
  expect(await verifyEmail(event)).toEqual({ returnTo: '/about' })
  expect(await fixture.repo.identity('google', 'external-new')).toMatchObject({ email: 'new@qq.com' })
  expect((await session(event))!.user.email).toBe('new@qq.com')
  expect((await session(event))!.loginProvider).toBe('google')
})
test('验证码绑定浏览器与 CSRF，邮件只发给 OAuth 邮箱，验证成功后才创建账号；并发仅消费一次', async () => {
  const { hash, code, request } = await pending()
  expect(await fixture.repo.query('SELECT * FROM auth_users')).toHaveLength(0)
  expect(JSON.parse(String(request.mock.calls[0]![1]?.body))).toMatchObject({ to: ['new@qq.com'] })
  expect((await fixture.repo.verification(hash))!.code_hash).not.toContain(code)
  body = { code }
  const csrf = headers.get('x-csrf-token')!
  headers.set('x-csrf-token', 'bad')
  await expect(verifyEmail(event)).rejects.toMatchObject({ statusCode: 403 })
  headers.set('x-csrf-token', csrf)
  const results = await Promise.allSettled([verifyEmail(event), verifyEmail(event)])
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  expect(await session(event)).toMatchObject({ user: { email: 'new@qq.com', role: 'user' } })
  expect(await fixture.repo.query('SELECT * FROM auth_users')).toHaveLength(1)
  expect(await verificationInfo(event)).toBeNull()
})
test('验证码五次错误后失效，过期不能消费，重发冷却及邮箱/IP 配额通过数据库原子限制', async () => {
  const { hash, code } = await pending()
  body = { code: code === '000000' ? '111111' : '000000' }
  for (let attempt = 0; attempt < 5; attempt++) await expect(verifyEmail(event)).rejects.toMatchObject({ statusCode: 400 })
  body = { code }
  await expect(verifyEmail(event)).rejects.toMatchObject({ statusCode: 400 })
  await expect(resendVerification(event)).rejects.toMatchObject({ statusCode: 429 })
  await fixture.repo.query('UPDATE auth_verifications SET attempts = 0,code_expires_at = 0 WHERE token_hash = ?', [hash])
  await expect(verifyEmail(event)).rejects.toMatchObject({ statusCode: 400 })
  const emailHash = await keyedDigest(event, 'email:new@qq.com')
  const ipHash = await keyedDigest(event, 'ip:127.0.0.1')
  for (let n = 1; n < 5; n++) {
    await fixture.repo.query('UPDATE auth_verifications SET send_after = 0')
    expect(await fixture.repo.reserveMail(hash, emailHash, ipHash, `hash-${n}`)).toBe(true)
  }
  await fixture.repo.query('UPDATE auth_verifications SET send_after = 0')
  expect(await fixture.repo.reserveMail(hash, emailHash, ipHash, 'limited')).toBe(false)
  for (let n = 5; n < 20; n++) await fixture.repo.query('INSERT INTO auth_mail_events VALUES (?,?,?,?)', [String(n), 'another-email', ipHash, Date.now()])
  expect(await fixture.repo.reserveMail(hash, 'new-email', ipHash, 'limited-ip')).toBe(false)
})
test('发送失败允许重试但保留配额，错误验证码不会创建账号；已注册邮箱不能经验证码转移身份', async () => {
  const { hash, request, code } = await pending()
  await fixture.repo.query('UPDATE auth_verifications SET send_after = 0')
  request.mockResolvedValue(Response.json({ error: 'unavailable' }, { status: 503 }))
  await expect(sendVerification(event, hash)).rejects.toMatchObject({ code: 'mail' })
  expect(await fixture.repo.verification(hash)).toMatchObject({ code_hash: null, send_after: 0 })
  request.mockResolvedValue(Response.json({ id: 'retry' }))
  await sendVerification(event, hash)
  const retry = JSON.parse(String(request.mock.calls.at(-1)![1]?.body)) as { text: string }
  body = { code: retry.text.match(/\d{6}/)![0] }
  await fixture.repo.resolve({ ...githubProfile, email: 'new@qq.com' })
  await expect(verifyEmail(event)).rejects.toMatchObject({ code: 'link' })
  expect(await fixture.repo.identity('google', 'new@qq.com')).toBeNull()
  expect(code).toHaveLength(6)
})
test('安全回跳保留站内查询和锚点，拒绝外部、编码反斜杠、API、子路径逃逸；邮箱不合并别名', () => {
  for (const value of ['https://evil.test', '//evil.test', '/%5cevil', '/api/auth/logout', '/%2f/evil', '/blog/../other']) expect(safeReturnTo(value, '/blog/')).toBe('/blog/posts')
  expect(safeReturnTo('/blog/posts?tag=x#h', '/blog/')).toBe('/blog/posts?tag=x#h')
  expect(adminEmails(' User+tag@Gmail.com,user.name@gmail.com ')).toEqual(['user+tag@gmail.com', 'user.name@gmail.com'])
})
