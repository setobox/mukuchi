import type { H3Event } from 'h3'
import type { AdminDatabase } from '../server/features/admin/database'
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test'
import { defineAdminHandler } from '../server/features/admin/http'
import { readIdToken } from '../server/features/auth/crypto'
import { finishOAuth, startLogin, startOAuth, transactionCookie } from '../server/features/auth/oauth'
import { createSession, logout, requireOwner, session, sessionCookie } from '../server/features/auth/session'
import { sha256 } from '../shared/admin/model'
import { adminEmails, profileSchema, safeReturnTo } from '../shared/auth/model'
import { authDatabase, oidcProfile } from './fixtures/auth'
import { mockIdentityProvider, oidcConfig } from './fixtures/oidc'

const state = vi.hoisted(() => ({ db: null as AdminDatabase | null }))
vi.mock('#admin-driver', () => ({ openDatabase: () => ({ batch: state.db!.batch, close() {} }), openStorage: vi.fn() }))
const cookies = new Map<string, string>()
const headers = new Map<string, string>()
let fixture: ReturnType<typeof authDatabase>
let idp: Awaited<ReturnType<typeof mockIdentityProvider>>
let query: Record<string, string>
let body: unknown
let requestUrl: URL
let config: typeof oidcConfig & { authAdminEmails: string, app: { baseURL: string } }
const event = { method: 'GET', context: {} } as H3Event
const setCookie = vi.fn((_event: H3Event, name: string, value: string) => cookies.set(name, value))
beforeEach(async () => {
  fixture = authDatabase()
  state.db = fixture.db
  idp = await mockIdentityProvider()
  cookies.clear()
  headers.clear()
  headers.set('origin', 'https://blog.test')
  headers.set('content-type', 'application/json')
  query = { returnTo: '/posts?tag=x#title' }
  body = {}
  requestUrl = new URL(oidcConfig.oidcRedirectUri)
  event.method = 'GET'
  config = { ...oidcConfig, authAdminEmails: ' Owner@Example.com ', app: { baseURL: '/' } }
  vi.stubGlobal('useRuntimeConfig', () => config)
  vi.stubGlobal('getCookie', (_event: H3Event, name: string) => cookies.get(name))
  vi.stubGlobal('setCookie', setCookie)
  vi.stubGlobal('deleteCookie', (_event: H3Event, name: string) => cookies.delete(name))
  vi.stubGlobal('getHeader', (_event: H3Event, name: string) => headers.get(name))
  vi.stubGlobal('getRequestURL', () => requestUrl)
  vi.stubGlobal('getQuery', () => query)
  vi.stubGlobal('getRequestWebStream', () => new Response(typeof body === 'string' ? body : JSON.stringify(body)).body)
  vi.stubGlobal('sendRedirect', (_event: H3Event, url: string) => url)
  vi.stubGlobal('setResponseHeader', vi.fn())
  vi.stubGlobal('setResponseStatus', vi.fn())
  vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
})
afterEach(() => {
  fixture.db.close()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})
async function begin(link = false) {
  const { url } = await startOAuth(event, link)
  requestUrl = idp.callback(url)
  return new URL(url)
}
async function login() {
  await begin()
  expect(await finishOAuth(event)).toBe('/posts?tag=x#title')
  headers.set('x-csrf-token', (await session(event))!.csrf)
  return (await session(event))!
}

test('完整 OIDC 登录使用 Basic + PKCE，令牌仅留服务端，轮换会话并返回原页面', async () => {
  const auth = await begin()
  expect(auth.searchParams.get('scope')).toBe('openid profile email')
  expect(auth.searchParams.get('code_challenge_method')).toBe('S256')
  expect(auth.searchParams.has('resource')).toBe(false)
  expect(await finishOAuth(event)).toBe('/posts?tag=x#title')
  expect(cookies.has(transactionCookie)).toBe(false)
  const original = cookies.get(sessionCookie)!
  const user = await session(event)
  expect(user).toMatchObject({ user: { role: 'admin', email: 'owner@example.com' }, loginProvider: 'sso', ssoLinked: true })
  expect(JSON.stringify(user)).not.toContain('test-access-token')
  const row = await fixture.repo.session(await sha256(original))
  expect(await readIdToken(row!.encrypted_id_token!, oidcConfig.authSessionKey)).toMatch(/^ey/)
  expect(setCookie.mock.calls.at(-1)).toMatchObject({ 3: { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 28800 } })
  await login()
  expect((await session(event))!.user.id).toBe(user!.user.id)
  expect(await fixture.repo.session(await sha256(original))).toBeNull()
  expect(await fixture.repo.query('SELECT * FROM auth_users')).toHaveLength(1)
  const me = (await import('../server/api/auth/me.get')).default
  const response = await me(event)
  expect(response).toMatchObject({ user: { id: user!.user.id }, centralLogoutAvailable: true })
  expect(JSON.stringify(response)).not.toMatch(/encrypted_id_token|access_token|id_token/)
})

test.each(['state', 'browser', 'expired', 'nonce', 'pkce', 'signature', 'issuer', 'audience', 'expiration', 'userinfo', 'unverified', 'missing-sub'])('拒绝 %s 错误，不创建会话或部分账号', async (failure) => {
  await begin()
  if (failure === 'state')
    requestUrl.searchParams.set('state', 'wrong')
  if (failure === 'browser')
    cookies.set(transactionCookie, 'another-browser')
  if (failure === 'expired')
    await fixture.repo.query('UPDATE auth_login_transactions SET expires_at = 0')
  if (failure === 'nonce')
    idp.behavior.claims.nonce = 'wrong'
  if (failure === 'pkce')
    idp.behavior.pkceInvalid = true
  if (failure === 'signature')
    idp.behavior.invalidSignature = true
  if (failure === 'issuer')
    idp.behavior.claims.iss = 'https://evil.test'
  if (failure === 'audience')
    idp.behavior.claims.aud = 'another-app'
  if (failure === 'expiration')
    idp.behavior.claims.exp = 1
  if (failure === 'userinfo')
    idp.behavior.userInfo.sub = 'other'
  if (failure === 'unverified')
    idp.behavior.userInfo.email_verified = false
  if (failure === 'missing-sub')
    idp.behavior.claims.sub = ''
  expect(String(await finishOAuth(event))).toContain('auth_error=')
  expect(await session(event)).toBeNull()
  expect(await fixture.repo.query('SELECT * FROM auth_users')).toHaveLength(0)
})

test('授权拒绝仍原子消费事务，重放不能创建会话', async () => {
  await begin()
  const browser = cookies.get(transactionCookie)!
  requestUrl.searchParams.set('error', 'access_denied')
  expect(String(await finishOAuth(event))).toContain('auth_error=cancelled')
  expect(await fixture.repo.query('SELECT * FROM auth_login_transactions')).toHaveLength(0)
  requestUrl.searchParams.delete('error')
  cookies.set(transactionCookie, browser)
  expect(String(await finishOAuth(event))).toContain('auth_error=expired')
  expect(await session(event)).toBeNull()
})

test('成功回调也只能消费一次；非本站 Host 不影响固定回调 URI', async () => {
  await begin()
  const browser = cookies.get(transactionCookie)!
  requestUrl.hostname = 'spoofed.test'
  expect(await finishOAuth(event)).toBe('/posts?tag=x#title')
  cookies.set(transactionCookie, browser)
  expect(String(await finishOAuth(event))).toContain('auth_error=expired')
  expect(await fixture.repo.query('SELECT * FROM auth_sessions')).toHaveLength(1)
})

test('同 issuer/sub 并发幂等；同邮箱不同身份不会合并，邮箱变化保持业务用户', async () => {
  const profile = profileSchema.parse({ ...oidcProfile, email: ' OWNER@Example.COM ' })
  const users = await Promise.all([fixture.repo.resolve(profile), fixture.repo.resolve(profile)])
  expect(users[0]!.id).toBe(users[1]!.id)
  await expect(fixture.repo.resolve({ ...profile, subject: 'different' })).rejects.toMatchObject({ code: 'link' })
  await expect(fixture.repo.resolve({ ...profile, issuer: 'https://other.test/api/auth' })).rejects.toMatchObject({ code: 'link' })
  expect(await fixture.repo.resolve({ ...profile, email: 'changed@example.com' })).toMatchObject({ id: users[0]!.id, email: 'owner@example.com' })
  expect(await fixture.repo.query('SELECT * FROM auth_users')).toHaveLength(1)
})

async function legacySession() {
  const id = crypto.randomUUID()
  await fixture.repo.query('INSERT INTO auth_users (id,email,name,avatar,created_at,updated_at) VALUES (?,?,?,?,?,?)', [id, 'owner@example.com', 'Legacy', '', Date.now(), Date.now()])
  await fixture.repo.query('INSERT INTO auth_identities (provider,subject,user_id) VALUES (?,?,?)', ['github', 'legacy', id])
  await createSession(event, id)
  headers.set('x-csrf-token', (await session(event))!.csrf)
  return id
}
test('旧账号必须通过已有会话与 CSRF 显式绑定，保留业务 ID', async () => {
  const id = await legacySession()
  headers.delete('x-csrf-token')
  await expect(startOAuth(event, true)).rejects.toMatchObject({ statusCode: 403 })
  headers.set('x-csrf-token', (await session(event))!.csrf)
  body = { returnTo: '/my' }
  await begin(true)
  expect(await finishOAuth(event)).toBe('/my')
  expect((await session(event))!.user.id).toBe(id)
  expect((await session(event))!.ssoLinked).toBe(true)
})

test.each(['logout', 'email', 'other-session'])('旧账号绑定拒绝 %s', async (failure) => {
  const id = await legacySession()
  await begin(true)
  if (failure === 'logout')
    await logout(event)
  if (failure === 'email')
    idp.behavior.userInfo.email = 'other@example.com'
  if (failure === 'other-session')
    await createSession(event, id)
  expect(String(await finishOAuth(event))).toContain('auth_error=')
  expect(await fixture.repo.query('SELECT * FROM auth_oidc_identities')).toHaveLength(0)
})

test('本地权限、停用和会话有效期由本站决定；退出要求同源和 CSRF', async () => {
  const current = await login()
  config.authAdminEmails = ''
  await expect(requireOwner(event)).rejects.toMatchObject({ statusCode: 403 })
  config.authAdminEmails = 'owner@example.com'
  event.method = 'POST'
  headers.delete('x-csrf-token')
  await expect(requireOwner(event)).rejects.toMatchObject({ statusCode: 403 })
  await expect(logout(event)).rejects.toMatchObject({ statusCode: 403 })
  headers.set('x-csrf-token', current.csrf)
  headers.set('origin', 'https://evil.test')
  await expect(logout(event)).rejects.toMatchObject({ statusCode: 403 })
  expect(await defineAdminHandler(requireOwner)(event)).toMatchObject({ statusCode: 403 })
  headers.set('origin', 'https://blog.test')
  await fixture.repo.query('UPDATE auth_users SET disabled = 1')
  expect(await session(event)).toBeNull()
  await begin()
  expect(String(await finishOAuth(event))).toContain('auth_error=')
  await logout(event)
  expect(await fixture.repo.query('SELECT * FROM auth_sessions')).toHaveLength(0)
  await fixture.repo.query('UPDATE auth_users SET disabled = 0')
  await login()
  await fixture.repo.query('UPDATE auth_sessions SET expires_at = 0')
  expect(await session(event)).toBeNull()
})

test.each([false, true])('账号中心退出失败=%s 时本地会话均已撤销，令牌只用于服务端跳转', async (fail) => {
  const current = await login()
  headers.set('content-type', 'application/x-www-form-urlencoded')
  body = new URLSearchParams({ csrf: current.csrf, scope: 'central' }).toString()
  idp.behavior.failDiscovery = fail
  const handler = (await import('../server/api/auth/logout.post')).default
  const result = String(await handler(event))
  expect(await session(event)).toBeNull()
  if (fail) {
    expect(result).toContain('auth_error=logout')
  }
  else {
    const url = new URL(result)
    expect(url.pathname).toBe('/api/auth/logout')
    expect(url.searchParams.get('post_logout_redirect_uri')).toBe('https://blog.test')
    expect(url.searchParams.get('id_token_hint')).toMatch(/^ey/)
  }
})

test('非法返回地址和配置失败均可安全重试，不自动循环登录', async () => {
  for (const value of ['https://evil.test', '//evil.test', '/%5cevil', '/api/auth/logout', '/%2f/evil', '/blog/../other']) expect(safeReturnTo(value, '/blog/')).toBe('/blog/posts')
  expect(safeReturnTo('/blog/posts?tag=x#h', '/blog/')).toBe('/blog/posts?tag=x#h')
  expect(adminEmails(' OWNER@Example.com ')).toEqual(['owner@example.com'])
  config.oidcClientSecret = ''
  expect(String(await startLogin(event))).toContain('auth_error=unavailable')
  expect(await fixture.repo.query('SELECT * FROM auth_login_transactions')).toHaveLength(0)
})
