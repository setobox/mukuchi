import * as oidc from 'openid-client'
import { readBoundedStream } from '../../features/admin/body'
import { readIdToken } from '../../features/auth/crypto'
import { authCookieOptions, defineAuthHandler } from '../../features/auth/http'
import { authReturn, transactionCookie } from '../../features/auth/oauth'
import { discoverOidc } from '../../features/auth/providers'
import { logout } from '../../features/auth/session'
import { oidcSettings } from '../../features/auth/settings'

export default defineAuthHandler(async (event) => {
  // Native form navigation keeps the protocol logout URL out of frontend state.
  const form = getHeader(event, 'content-type')?.split(';')[0] === 'application/x-www-form-urlencoded'
  const fields = form ? new URLSearchParams(new TextDecoder().decode(await readBoundedStream(getRequestWebStream(event), 4096))) : null
  const current = await logout(event, fields?.get('csrf') ?? getHeader(event, 'x-csrf-token'))
  deleteCookie(event, transactionCookie, authCookieOptions(event, 0))
  if (!form)
    return { ok: true }
  const fallback = `${useRuntimeConfig(event).app.baseURL.replace(/\/$/, '')}/posts`
  if (fields?.get('scope') !== 'central')
    return sendRedirect(event, fallback, 303)
  try {
    const settings = oidcSettings(event)
    if (!current?.encrypted_id_token || current.oidc_issuer !== settings.oidcIssuer)
      return sendRedirect(event, fallback, 303)
    const hint = await readIdToken(current.encrypted_id_token, settings.authSessionKey)
    const config = await discoverOidc(settings)
    const url = oidc.buildEndSessionUrl(config, { id_token_hint: hint, post_logout_redirect_uri: settings.oidcPostLogoutRedirectUri })
    setResponseHeader(event, 'referrer-policy', 'no-referrer')
    return sendRedirect(event, url.href, 303)
  }
  catch {
    return sendRedirect(event, authReturn(event, fallback, 'login', 'logout'), 303)
  }
})
