import type { AuthProfile } from '../../../shared/auth/model'
import type { LoginTransaction } from './repository'
import type { OidcSettings } from './settings'
import * as oidc from 'openid-client'
import { z } from 'zod'
import { AuthError, avatarSchema, emailSchema } from '../../../shared/auth/model'
import { localHttp } from './settings'

export async function discoverOidc(settings: OidcSettings) {
  const issuer = new URL(settings.oidcIssuer)
  const config = await oidc.discovery(issuer, settings.oidcClientId, { id_token_signed_response_alg: 'RS256' }, oidc.ClientSecretBasic(settings.oidcClientSecret), {
    algorithm: 'oidc',
    timeout: 10,
    execute: [oidc.enableNonRepudiationChecks, ...(localHttp(issuer, settings.development) ? [oidc.allowInsecureRequests] : [])],
  })
  const metadata = config.serverMetadata()
  for (const endpoint of [metadata.authorization_endpoint, metadata.token_endpoint, metadata.userinfo_endpoint, metadata.jwks_uri, metadata.end_session_endpoint]) {
    if (!endpoint)
      throw new AuthError(503, '账号中心缺少必要的 OIDC 端点')
    const url = new URL(endpoint)
    if (url.username || url.password || url.hash || (url.protocol !== 'https:' && !localHttp(url, settings.development)))
      throw new AuthError(503, '账号中心端点无效')
  }
  return config
}
const userInfoSchema = z.object({ sub: z.string().min(1).max(255), email: emailSchema, email_verified: z.literal(true), name: z.string().trim().min(1).max(200).optional(), picture: z.string().optional() })
export function oidcProfile(value: unknown, issuer: string, subject: string): AuthProfile {
  const parsed = userInfoSchema.safeParse(value)
  if (!parsed.success)
    throw new AuthError(403, '账号资料无效或邮箱未验证', 'email')
  const info = parsed.data
  if (info.sub !== subject)
    throw new AuthError(403, '账号中心身份不一致')
  return { issuer, subject, email: info.email, name: info.name ?? info.email.split('@')[0]!, avatar: avatarSchema.safeParse(info.picture).success ? info.picture! : '', trustedEmail: true }
}
export async function exchangeIdentity(config: oidc.Configuration, settings: OidcSettings, callback: URL, transaction: LoginTransaction, state: string) {
  const tokens = await oidc.authorizationCodeGrant(config, callback, { pkceCodeVerifier: transaction.verifier, expectedState: state, expectedNonce: transaction.nonce, idTokenExpected: true })
  const claims = tokens.claims()
  if (!claims || typeof claims.sub !== 'string' || !claims.sub || !tokens.id_token)
    throw new AuthError(403, '账号中心未返回有效身份')
  const info = await oidc.fetchUserInfo(config, tokens.access_token, claims.sub)
  return { profile: oidcProfile(info, settings.oidcIssuer, claims.sub), idToken: tokens.id_token }
}
