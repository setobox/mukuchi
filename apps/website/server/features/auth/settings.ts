import type { H3Event } from 'h3'
import { z } from 'zod'
import { AuthError } from '../../../shared/auth/model'

const schema = z.object({
  appOrigin: z.url(),
  oidcIssuer: z.url(),
  oidcClientId: z.string().regex(/^[a-z][a-z0-9-]{2,63}$/),
  oidcClientSecret: z.string().min(1).refine(value => value === value.trim() && !/replace|example|placeholder|填写|<|>/i.test(value)),
  oidcRedirectUri: z.url(),
  oidcPostLogoutRedirectUri: z.url(),
  oidcScopes: z.literal('openid profile email'),
  authSessionKey: z.string().refine((value) => {
    try {
      return /^[A-Z0-9+/]{43}=$/i.test(value) && atob(value).length === 32
    }
    catch { return false }
  }),
  authSessionMaxAge: z.coerce.number().int().min(300).max(604800).default(28800),
})
export type OidcSettings = z.infer<typeof schema> & { development: boolean }
export function localHttp(url: URL, development: boolean) {
  return development && url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
}
export function parseOidcSettings(value: unknown, development: boolean, baseURL = '/'): OidcSettings {
  const parsed = schema.safeParse(value)
  // Never include Zod inputs (which contain secrets) in an error.
  if (!parsed.success)
    throw new AuthError(503, 'OIDC 服务端配置不完整或无效', 'unavailable')
  const settings = parsed.data
  const origin = new URL(settings.appOrigin)
  const issuer = new URL(settings.oidcIssuer)
  const redirect = new URL(settings.oidcRedirectUri)
  const logout = new URL(settings.oidcPostLogoutRedirectUri)
  if ([origin, issuer, redirect, logout].some(url => url.username || url.password || url.hash || url.search || (url.protocol !== 'https:' && !localHttp(url, development)))
    || origin.pathname !== '/' || issuer.pathname !== '/api/auth' || issuer.href !== settings.oidcIssuer
    || redirect.origin !== origin.origin || logout.origin !== origin.origin
    || redirect.pathname !== `${baseURL.replace(/\/$/, '')}/api/auth/sso/callback`
    || logout.pathname !== baseURL || settings.authSessionKey === settings.oidcClientSecret) {
    throw new AuthError(503, 'OIDC 地址或会话配置无效', 'unavailable')
  }
  return { ...settings, appOrigin: origin.origin, development }
}
export function oidcSettings(event?: H3Event) {
  const config = useRuntimeConfig(event)
  return parseOidcSettings(config, import.meta.dev, config.app.baseURL)
}
export function ssoAvailable(event: H3Event) {
  try {
    oidcSettings(event)
    return true
  }
  catch { return false }
}
