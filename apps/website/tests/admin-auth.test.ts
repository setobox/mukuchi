import type { H3Event } from 'h3'
import type { AdminRepository } from '../server/features/admin/repository'
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test'
import { finishOAuth, startOAuth } from '../server/features/auth/oauth'
import { createSession, logout, requireOwner, session } from '../server/features/auth/session'
import { sha256 } from '../shared/admin/model'

const state = vi.hoisted(() => ({ rows: new Map<string, Record<string, unknown>>(), oauth: new Map<string, Record<string, unknown>>() }))
vi.mock('../server/features/admin/http', () => ({
  withAdmin: async (_event: H3Event, action: (repo: Pick<AdminRepository, 'query'>) => unknown) => action({
    async query(sql, params = []) {
      if (sql.startsWith('INSERT INTO admin_sessions')) {
        state.rows.set(String(params[0]), { user_id: params[1], login: params[2], avatar: params[3], local: params[4], csrf: params[5], expires_at: params[6] })
        return []
      }
      if (sql.startsWith('SELECT user_id')) {
        const row = state.rows.get(String(params[0]))
        return row && Number(row.expires_at) > Number(params[1]) ? [row] : []
      }
      if (sql.startsWith('DELETE FROM admin_sessions WHERE token_hash'))
        state.rows.delete(String(params[0]))
      if (sql.startsWith('INSERT INTO admin_oauth'))
        state.oauth.set(String(params[0]), { verifier: params[1], expires_at: params[2] })
      if (sql.startsWith('DELETE FROM admin_oauth WHERE state_hash')) {
        const row = state.oauth.get(String(params[0]))
        state.oauth.delete(String(params[0]))
        return row && Number(row.expires_at) > Number(params[1]) ? [row] : []
      }
      return []
    },
  }),
  requireOrigin: vi.fn(),
}))
const cookies = new Map<string, string>()
const headers = new Map<string, string>()
let query: Record<string, string> = {}
const event = { method: 'GET' } as H3Event
const setCookie = vi.fn((_event: H3Event, name: string, value: string) => cookies.set(name, value))
beforeEach(() => {
  state.rows.clear()
  state.oauth.clear()
  cookies.clear()
  headers.clear()
  query = {}
  event.method = 'GET'
  vi.stubGlobal('useRuntimeConfig', () => ({ adminOwnerId: 83793448, app: { baseURL: '/' }, public: { siteUrl: 'https://blog.setobox.me' }, githubClientId: 'test-client', githubClientSecret: 'test-secret' }))
  vi.stubGlobal('getCookie', (_event: H3Event, name: string) => cookies.get(name))
  vi.stubGlobal('setCookie', setCookie)
  vi.stubGlobal('deleteCookie', (_event: H3Event, name: string) => cookies.delete(name))
  vi.stubGlobal('getHeader', (_event: H3Event, name: string) => headers.get(name))
  vi.stubGlobal('getRequestURL', () => new URL('https://blog.setobox.me/api/auth/callback'))
  vi.stubGlobal('getQuery', () => query)
  vi.stubGlobal('sendRedirect', (_event: H3Event, url: string) => url)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

test('普通 GitHub 用户无法越权，站主依据数字 ID，数据库只保存令牌摘要且退出可撤销', async () => {
  await createSession(event, { id: 12, login: 'setobox', avatar: '', local: false })
  await expect(requireOwner(event)).rejects.toMatchObject({ statusCode: 403 })
  await createSession(event, { id: 83793448, login: 'renamed-owner', avatar: '', local: false })
  const token = cookies.get('mukuchi:session')!
  expect(state.rows.has(token)).toBe(false)
  expect(state.rows.has(await sha256(token))).toBe(true)
  expect(setCookie.mock.calls.at(-1)).toMatchObject({ 3: { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 604800 } })
  await expect(requireOwner(event)).resolves.toMatchObject({ user: { owner: true } })
  event.method = 'POST'
  await expect(requireOwner(event)).rejects.toMatchObject({ statusCode: 403 })
  const current = await session(event)
  headers.set('x-csrf-token', current!.csrf)
  await logout(event)
  cookies.set('mukuchi:session', token)
  expect(await session(event)).toBeNull()
})

test('过期会话和生产环境的本地会话均不可用', async () => {
  await createSession(event, { id: 83793448, login: 'owner', avatar: '', local: false })
  const row = state.rows.get(await sha256(cookies.get('mukuchi:session')!))!
  row.expires_at = 0
  expect(await session(event)).toBeNull()
  await createSession(event, { id: 83793448, login: 'local', avatar: '', local: true })
  expect(await session(event)).toBeNull()
})

test('OAuth 使用固定回调、PKCE、单次 state；拒绝跨浏览器、过期与回放请求', async () => {
  const target = new URL(await startOAuth(event) as string)
  expect(target.searchParams.get('redirect_uri')).toBe('https://blog.setobox.me/api/auth/callback')
  expect(target.searchParams.get('code_challenge_method')).toBe('S256')
  expect(target.searchParams.get('scope')).toBe('')
  const oauthState = target.searchParams.get('state')!
  const verifier = String(state.oauth.get(await sha256(oauthState))!.verifier)
  const challenge = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  expect(target.searchParams.get('code_challenge')).toBe(challenge)
  query = { state: crypto.randomUUID(), code: 'test-code' }
  await expect(finishOAuth(event)).rejects.toMatchObject({ statusCode: 400 })
  query.state = oauthState
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ access_token: 'identity-only' })).mockResolvedValueOnce(Response.json({ id: 83793448, login: 'owner', avatar_url: 'https://avatars.githubusercontent.com/u/83793448' }))
  vi.stubGlobal('fetch', request)
  await expect(finishOAuth(event)).resolves.toBe('/admin')
  const body = JSON.parse(String(request.mock.calls[0]![1]?.body)) as Record<string, unknown>
  expect(body).toMatchObject({ code_verifier: verifier, redirect_uri: 'https://blog.setobox.me/api/auth/callback' })
  cookies.set('mukuchi:oauth', oauthState)
  await expect(finishOAuth(event)).rejects.toMatchObject({ statusCode: 400 })
  await startOAuth(event)
  query.state = cookies.get('mukuchi:oauth')!
  state.oauth.get(await sha256(query.state))!.expires_at = 0
  await expect(finishOAuth(event)).rejects.toMatchObject({ statusCode: 400 })
  expect(request).toHaveBeenCalledTimes(2)
})
