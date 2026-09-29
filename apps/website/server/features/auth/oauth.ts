import type { H3Event } from 'h3'
import type { AuthProvider } from '../../../shared/auth/model'
import { z } from 'zod'
import { sha256 } from '../../../shared/admin/model'
import { AuthError, safeReturnTo } from '../../../shared/auth/model'
import { authCookieOptions, readAuthJson, withAuth } from './http'
import { callbackUrl, exchangeProfile, providerConfig } from './providers'
import { createSession, requireAuthSession, session } from './session'
import { beginVerification, clearVerification, sendVerification } from './verification'

const stateCookie = (provider: AuthProvider) => `mukuchi:oauth:${provider}`
export function authReturn(event: H3Event, returnTo: string, result?: string, error?: string) {
  const url = new URL(safeReturnTo(returnTo, useRuntimeConfig(event).app.baseURL), 'https://return.invalid')
  if (result)
    url.searchParams.set('auth', result)
  if (error)
    url.searchParams.set('auth_error', error)
  return `${url.pathname}${url.search}${url.hash}`
}
export async function startLogin(event: H3Event, provider: AuthProvider) {
  try {
    return await startOAuth(event, provider)
  }
  catch (cause) {
    const returnTo = safeReturnTo(getQuery(event).returnTo, useRuntimeConfig(event).app.baseURL)
    return sendRedirect(event, authReturn(event, returnTo, 'login', cause instanceof AuthError ? cause.code : 'failed'))
  }
}
export async function startOAuth(event: H3Event, provider: AuthProvider = 'github', link = false) {
  const config = providerConfig(event, provider)
  if (!config.id || !config.secret)
    throw new AuthError(503, '此登录方式尚未配置', 'unavailable')
  const current = link ? await requireAuthSession(event) : null
  if (current?.user.local)
    throw new AuthError(400, '本地开发会话不能关联第三方账号')
  const input = link ? z.object({ returnTo: z.string().optional() }).parse(await readAuthJson(event)) : getQuery(event)
  const returnTo = safeReturnTo(input.returnTo, useRuntimeConfig(event).app.baseURL)
  const state = crypto.randomUUID()
  const verifier = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '')
  const nonce = crypto.randomUUID()
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
  const challenge = btoa(String.fromCharCode(...digest)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  await withAuth(event, async repo => repo.saveOAuth(await sha256(state), { provider, verifier, nonce, user_id: current?.user.id ?? null, session_hash: current?.hash ?? null, return_to: returnTo, expires_at: Date.now() + 600_000 }))
  setCookie(event, stateCookie(provider), state, authCookieOptions(event, 600))
  const url = new URL(config.authorize)
  url.search = new URLSearchParams({ client_id: config.id, redirect_uri: callbackUrl(event, provider), response_type: 'code', state, scope: config.scope, code_challenge: challenge, code_challenge_method: 'S256', ...(provider === 'google' ? { nonce, prompt: 'select_account' } : {}) }).toString()
  return link ? { url: url.href } : sendRedirect(event, url.href)
}
export async function finishOAuth(event: H3Event, provider: AuthProvider = 'github') {
  let returnTo = safeReturnTo(undefined, useRuntimeConfig(event).app.baseURL)
  let verifying = false
  try {
    const query = z.object({ state: z.uuid(), code: z.string().min(1).max(4096).optional(), error: z.string().max(200).optional() }).safeParse(getQuery(event))
    if (!query.success || getCookie(event, stateCookie(provider)) !== query.data.state)
      throw new AuthError(400, '登录请求已失效', 'expired')
    deleteCookie(event, stateCookie(provider), authCookieOptions(event, 0))
    const request = await withAuth(event, async repo => repo.consumeOAuth(await sha256(query.data.state), provider))
    if (!request)
      throw new AuthError(400, '登录请求已过期或使用', 'expired')
    returnTo = request.return_to
    if (query.data.error)
      throw new AuthError(400, '已取消授权', 'cancelled')
    if (!query.data.code)
      throw new AuthError(400, '缺少授权码', 'expired')
    const profile = await exchangeProfile(event, provider, query.data.code, request.verifier, request.nonce)
    if (request.user_id) {
      const current = await session(event)
      if (!current || current.user.local || current.hash !== request.session_hash || current.user.id !== request.user_id)
        throw new AuthError(401, '关联请求已失效，请重新登录', 'expired')
      if (current.user.email !== profile.email)
        throw new AuthError(400, '邮箱不一致', 'mismatch')
      await withAuth(event, repo => repo.link(current.user.id, profile))
      return sendRedirect(event, authReturn(event, returnTo, 'linked'))
    }
    const existing = await withAuth(event, repo => repo.identity(provider, profile.subject))
    if (existing) {
      await withAuth(event, repo => repo.syncProfile(existing.id, profile))
      await createSession(event, existing.id, provider)
    }
    else if (profile.trustedEmail) {
      const user = await withAuth(event, repo => repo.resolve(profile))
      await createSession(event, user.id, provider)
    }
    else {
      if (await withAuth(event, repo => repo.emailExists(profile.email)))
        throw new AuthError(409, '请先登录已有账号再关联', 'link')
      const hash = await beginVerification(event, profile, returnTo)
      verifying = true
      await sendVerification(event, hash)
      return sendRedirect(event, authReturn(event, returnTo, 'verify'))
    }
    await clearVerification(event)
    return sendRedirect(event, authReturn(event, returnTo))
  }
  catch (cause) {
    const code = cause instanceof AuthError ? cause.code : 'failed'
    return sendRedirect(event, authReturn(event, returnTo, verifying ? 'verify' : 'login', code))
  }
}
