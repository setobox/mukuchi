import type { H3Event } from 'h3'
import type { AuthProfile, AuthProvider } from '../../../shared/auth/model'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { z } from 'zod'
import { AuthError, avatarSchema, emailSchema, profileSchema } from '../../../shared/auth/model'

const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'), { timeoutDuration: 10_000 })
export function providerConfig(event: H3Event, provider: AuthProvider) {
  const config = useRuntimeConfig(event)
  return provider === 'github'
    ? { id: config.githubClientId, secret: config.githubClientSecret, authorize: 'https://github.com/login/oauth/authorize', token: 'https://github.com/login/oauth/access_token', callback: '/api/auth/callback', scope: 'user:email' }
    : { id: config.googleClientId, secret: config.googleClientSecret, authorize: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', callback: '/api/auth/google/callback', scope: 'openid email profile' }
}
export function availableProviders(event: H3Event) {
  const configured = (provider: AuthProvider) => {
    const config = providerConfig(event, provider)
    return !!config.id && !!config.secret
  }
  return { github: configured('github'), google: configured('google') }
}
export function callbackUrl(event: H3Event, provider: AuthProvider) {
  const config = useRuntimeConfig(event)
  return `${config.public.siteUrl.replace(/\/$/, '')}${config.app.baseURL.replace(/\/$/, '')}${providerConfig(event, provider).callback}`
}
export async function providerJson(url: string, options: RequestInit = {}): Promise<unknown> {
  const response = await fetch(url, { ...options, redirect: 'manual', signal: AbortSignal.timeout(10_000) })
  if (!response.ok)
    throw new AuthError(502, '登录平台暂时不可用，请重试')
  return response.json()
}
function avatar(value: unknown) {
  const parsed = avatarSchema.safeParse(value)
  return parsed.success ? parsed.data : ''
}
export function googleProfile(value: unknown): AuthProfile {
  const claims = z.object({ sub: z.string().min(1).max(255), email: emailSchema, email_verified: z.literal(true), name: z.string().max(200).optional(), picture: z.unknown().optional(), hd: z.string().min(1).optional() }).safeParse(value)
  if (!claims.success)
    throw new AuthError(400, '请先验证 Google 邮箱', 'email')
  const p = claims.data
  return { provider: 'google', subject: p.sub, email: p.email, name: p.name?.trim() || p.email.split('@')[0]!, avatar: avatar(p.picture), trustedEmail: p.email.endsWith('@gmail.com') || !!p.hd }
}
export async function verifyGoogleToken(token: string, clientId: string, nonce: string) {
  const { payload } = await jwtVerify(token, googleKeys, { algorithms: ['RS256'], issuer: ['https://accounts.google.com', 'accounts.google.com'], audience: clientId, requiredClaims: ['exp', 'iat', 'sub', 'nonce'] })
  if (payload.nonce !== nonce || (payload.azp && payload.azp !== clientId))
    throw new AuthError(401, 'Google 身份校验失败')
  return googleProfile(payload)
}
export async function exchangeProfile(event: H3Event, provider: AuthProvider, code: string, verifier: string, nonce: string) {
  const config = providerConfig(event, provider)
  const tokens = await providerJson(config.token, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'accept': 'application/json' }, body: new URLSearchParams({ grant_type: 'authorization_code', client_id: config.id, client_secret: config.secret, code, redirect_uri: callbackUrl(event, provider), code_verifier: verifier }) })
  if (provider === 'google') {
    const token = z.object({ id_token: z.string().min(1) }).parse(tokens)
    return verifyGoogleToken(token.id_token, config.id, nonce)
  }
  const token = z.object({ access_token: z.string().min(1) }).parse(tokens)
  const headers = { 'Authorization': `Bearer ${token.access_token}`, 'Accept': 'application/vnd.github+json', 'User-Agent': 'mukuchi' }
  const user = z.object({ id: z.number().int().positive().safe(), login: z.string().min(1).max(100), name: z.string().max(200).nullable().optional(), avatar_url: z.unknown().optional() }).parse(await providerJson('https://api.github.com/user', { headers }))
  let email: string | undefined
  for (let page = 1; page <= 10; page++) {
    const emails = z.array(z.object({ email: emailSchema, primary: z.boolean(), verified: z.boolean() })).parse(await providerJson(`https://api.github.com/user/emails?per_page=100&page=${page}`, { headers }))
    email = emails.find(item => item.primary && item.verified)?.email
    if (email || emails.length < 100)
      break
  }
  if (!email)
    throw new AuthError(400, '请先在 GitHub 验证主邮箱', 'email')
  return profileSchema.parse({ provider, subject: String(user.id), email, name: user.name?.trim() || user.login, avatar: avatar(user.avatar_url), trustedEmail: true })
}
