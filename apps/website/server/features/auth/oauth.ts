import type { H3Event } from 'h3'
import * as oidc from 'openid-client'
import { z } from 'zod'
import { sha256 } from '../../../shared/admin/model'
import { AuthError, safeReturnTo } from '../../../shared/auth/model'
import { authCookieOptions, readAuthJson, withAuth } from './http'
import { discoverOidc, exchangeIdentity } from './providers'
import { createSession, requireAuthSession, session } from './session'
import { oidcSettings } from './settings'

export const transactionCookie = 'mukuchi:oidc:transaction'
export function authReturn(event: H3Event, returnTo: string, result?: string, error?: string) {
  const url = new URL(safeReturnTo(returnTo, useRuntimeConfig(event).app.baseURL), 'https://return.invalid')
  if (result)
    url.searchParams.set('auth', result)
  if (error)
    url.searchParams.set('auth_error', error)
  return `${url.pathname}${url.search}${url.hash}`
}
export async function startLogin(event: H3Event) {
  try {
    return sendRedirect(event, (await startOAuth(event)).url)
  }
  catch (cause) {
    return sendRedirect(event, authReturn(event, safeReturnTo(getQuery(event).returnTo, useRuntimeConfig(event).app.baseURL), 'login', cause instanceof AuthError ? cause.code : 'failed'))
  }
}
export async function startOAuth(event: H3Event, link = false) {
  const settings = oidcSettings(event)
  const current = link ? await requireAuthSession(event) : null
  if (current?.user.local)
    throw new AuthError(400, '本地开发会话不能绑定账号中心')
  const input = link ? z.object({ returnTo: z.string().optional() }).parse(await readAuthJson(event)) : getQuery(event)
  const returnTo = safeReturnTo(input.returnTo, useRuntimeConfig(event).app.baseURL)
  const config = await discoverOidc(settings)
  const state = oidc.randomState()
  const browser = oidc.randomState()
  const verifier = oidc.randomPKCECodeVerifier()
  const nonce = oidc.randomNonce()
  const challenge = await oidc.calculatePKCECodeChallenge(verifier)
  await withAuth(event, async repo => repo.saveTransaction(await sha256(state), { browser_hash: await sha256(browser), verifier, nonce, issuer: settings.oidcIssuer, client_id: settings.oidcClientId, redirect_uri: settings.oidcRedirectUri, user_id: current?.user.id ?? null, session_hash: current?.hash ?? null, return_to: returnTo, expires_at: Date.now() + 600_000 }))
  setCookie(event, transactionCookie, browser, authCookieOptions(event, 600))
  const url = oidc.buildAuthorizationUrl(config, { client_id: settings.oidcClientId, redirect_uri: settings.oidcRedirectUri, response_type: 'code', scope: settings.oidcScopes, state, nonce, code_challenge: challenge, code_challenge_method: 'S256' })
  return { url: url.href }
}
export async function finishOAuth(event: H3Event) {
  let returnTo = safeReturnTo(undefined, useRuntimeConfig(event).app.baseURL)
  try {
    const settings = oidcSettings(event)
    // Ignore incoming Host and proxy headers; only transfer the response query.
    const callback = new URL(settings.oidcRedirectUri)
    callback.search = getRequestURL(event).search
    const states = callback.searchParams.getAll('state')
    const state = states[0]
    const browser = getCookie(event, transactionCookie)
    if (states.length !== 1 || !state || state.length > 256 || !browser || browser.length > 256)
      throw new AuthError(400, '登录请求已失效', 'expired')
    const transaction = await withAuth(event, async repo => repo.consumeTransaction(await sha256(state), await sha256(browser)))
    if (!transaction || transaction.issuer !== settings.oidcIssuer || transaction.client_id !== settings.oidcClientId || transaction.redirect_uri !== settings.oidcRedirectUri)
      throw new AuthError(400, '登录请求已失效', 'expired')
    returnTo = transaction.return_to
    if (callback.searchParams.has('error'))
      throw new AuthError(400, '授权失败', callback.searchParams.get('error') === 'access_denied' ? 'cancelled' : 'failed')
    let link: { userId: string, sessionHash: string } | undefined
    if (transaction.user_id) {
      const current = await session(event)
      if (!current || current.user.local || current.user.id !== transaction.user_id || current.hash !== transaction.session_hash)
        throw new AuthError(403, '关联会话已失效', 'expired')
      link = { userId: current.user.id, sessionHash: current.hash }
    }
    const config = await discoverOidc(settings)
    const identity = await exchangeIdentity(config, settings, callback, transaction, state)
    if (link) {
      const current = await session(event)
      if (!current || current.hash !== link.sessionHash)
        throw new AuthError(403, '关联会话已失效', 'expired')
      if (current.user.email !== identity.profile.email)
        throw new AuthError(403, '绑定邮箱必须一致', 'mismatch')
    }
    const user = await withAuth(event, repo => repo.resolve(identity.profile, link))
    await createSession(event, user.id, { issuer: settings.oidcIssuer, idToken: identity.idToken })
    return sendRedirect(event, authReturn(event, returnTo))
  }
  catch (cause) {
    // SDK errors can contain tokens/response bodies. Never log or expose them.
    return sendRedirect(event, authReturn(event, returnTo, 'login', cause instanceof AuthError ? cause.code : 'failed'))
  }
  finally { deleteCookie(event, transactionCookie, authCookieOptions(event, 0)) }
}
