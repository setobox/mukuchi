import type { H3Event } from 'h3'
import { z } from 'zod'
import { AdminError, sha256 } from '../../../shared/admin/model'
import { withAdmin } from '../admin/http'
import { createSession } from './session'

function callbackUrl(event: H3Event) {
  const config = useRuntimeConfig(event)
  return `${config.public.siteUrl.replace(/\/$/, '')}${config.app.baseURL.replace(/\/$/, '')}/api/auth/callback`
}
const stateCookie = 'mukuchi:oauth'
const stateOptions = (event: H3Event) => ({ httpOnly: true, sameSite: 'lax' as const, secure: getRequestURL(event).protocol === 'https:', path: useRuntimeConfig(event).app.baseURL, maxAge: 600 })
export async function startOAuth(event: H3Event) {
  const config = useRuntimeConfig(event)
  if (!config.githubClientId || !config.githubClientSecret)
    throw new AdminError(503, 'GitHub 登录尚未配置')
  const state = crypto.randomUUID()
  const verifier = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '')
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
  const challenge = btoa(String.fromCharCode(...digest)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  await withAdmin(event, async (repo) => {
    await repo.query('DELETE FROM admin_oauth WHERE expires_at < ?', [Date.now()])
    await repo.query('INSERT INTO admin_oauth (state_hash,verifier,expires_at) VALUES (?,?,?)', [await sha256(state), verifier, Date.now() + 600_000])
  })
  setCookie(event, stateCookie, state, stateOptions(event))
  const url = new URL('https://github.com/login/oauth/authorize')
  url.search = new URLSearchParams({ client_id: config.githubClientId, redirect_uri: callbackUrl(event), state, scope: '', code_challenge: challenge, code_challenge_method: 'S256' }).toString()
  return sendRedirect(event, url.href)
}
export async function finishOAuth(event: H3Event) {
  const query = z.object({ state: z.uuid(), code: z.string().min(1).max(200) }).safeParse(getQuery(event))
  if (!query.success || getCookie(event, stateCookie) !== query.data.state)
    throw new AdminError(400, '登录请求已失效，请重新登录')
  const { state, code } = query.data
  deleteCookie(event, stateCookie, stateOptions(event))
  const row = await withAdmin(event, async repo => (await repo.query('DELETE FROM admin_oauth WHERE state_hash = ? AND expires_at > ? RETURNING verifier', [await sha256(state), Date.now()]))[0])
  if (!row)
    throw new AdminError(400, '登录请求已使用或过期')
  const config = useRuntimeConfig(event)
  const response = await fetch('https://github.com/login/oauth/access_token', { method: 'POST', headers: { 'content-type': 'application/json', 'accept': 'application/json' }, body: JSON.stringify({ client_id: config.githubClientId, client_secret: config.githubClientSecret, code, redirect_uri: callbackUrl(event), code_verifier: row.verifier }), signal: AbortSignal.timeout(10000) })
  const token = z.object({ access_token: z.string().min(1) }).safeParse(await response.json())
  if (!response.ok || !token.success)
    throw new AdminError(401, 'GitHub 登录失败，请重试')
  const profileResponse = await fetch('https://api.github.com/user', { headers: { 'Authorization': `Bearer ${token.data.access_token}`, 'Accept': 'application/vnd.github+json', 'User-Agent': 'mukuchi' }, signal: AbortSignal.timeout(10000) })
  if (!profileResponse.ok)
    throw new AdminError(401, '无法确认 GitHub 身份')
  const profile = z.object({ id: z.number().int().positive(), login: z.string().max(100), avatar_url: z.url() }).parse(await profileResponse.json())
  await createSession(event, { id: profile.id, login: profile.login, avatar: profile.avatar_url, local: false })
  return sendRedirect(event, `${config.app.baseURL.replace(/\/$/, '')}${profile.id === Number(config.adminOwnerId) ? '/admin' : '/posts'}`)
}
