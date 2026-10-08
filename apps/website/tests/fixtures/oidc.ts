import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import * as oidc from 'openid-client'
import { vi } from 'vite-plus/test'
import { parseOidcSettings } from '../../server/features/auth/settings'

export const oidcConfig = {
  appOrigin: 'https://blog.test',
  oidcIssuer: 'https://id.test/api/auth',
  oidcClientId: 'mukuchi-test',
  oidcClientSecret: 'test-only-client-secret',
  oidcRedirectUri: 'https://blog.test/api/auth/sso/callback',
  oidcPostLogoutRedirectUri: 'https://blog.test',
  oidcScopes: 'openid profile email',
  authSessionKey: btoa('t'.repeat(32)),
  authSessionMaxAge: 28800,
}
export async function mockIdentityProvider() {
  const settings = parseOidcSettings(oidcConfig, false)
  const pair = await generateKeyPair('RS256', { extractable: true })
  const wrongPair = await generateKeyPair('RS256')
  const issuer = settings.oidcIssuer
  const endpoints = { authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, userinfo_endpoint: `${issuer}/userinfo`, jwks_uri: `${issuer}/jwks`, end_session_endpoint: `${issuer}/logout` }
  const metadata = { issuer, ...endpoints, response_types_supported: ['code'], subject_types_supported: ['public'], id_token_signing_alg_values_supported: ['RS256'], token_endpoint_auth_methods_supported: ['client_secret_basic'], code_challenge_methods_supported: ['S256'] }
  const behavior = {
    claims: {} as Record<string, unknown>,
    userInfo: { sub: 'subject-1', name: 'Owner', email: 'owner@example.com', email_verified: true, picture: 'https://id.test/avatar.png' } as Record<string, unknown>,
    invalidSignature: false,
    failDiscovery: false,
    failLogout: false,
    pkceInvalid: false,
  }
  const codes = new Map<string, URL>()
  const requests: { url: string, headers: Headers, body: URLSearchParams }[] = []
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    const headers = new Headers(init?.headers)
    const body = new URLSearchParams(String(init?.body ?? ''))
    requests.push({ url, headers, body })
    if (url.endsWith('/.well-known/openid-configuration'))
      return behavior.failDiscovery ? json({}, 503) : json(metadata)
    if (url === endpoints.jwks_uri)
      return json({ keys: [{ ...await exportJWK(pair.publicKey), kid: 'test', alg: 'RS256', use: 'sig' }] })
    if (url === endpoints.token_endpoint) {
      const auth = codes.get(body.get('code') ?? '')
      codes.delete(body.get('code') ?? '')
      if (!auth)
        throw new Error('fixture code missing')
      if (headers.get('authorization')?.toLowerCase().startsWith('basic ') !== true)
        throw new Error('fixture basic missing')
      if (body.get('redirect_uri') !== settings.oidcRedirectUri)
        throw new Error('fixture redirect mismatch')
      const credentials = atob(headers.get('authorization')!.slice(6)).split(':').map(value => decodeURIComponent(value.replace(/\+/g, ' ')))
      if (credentials[0] !== settings.oidcClientId || credentials[1] !== settings.oidcClientSecret)
        throw new Error('fixture basic mismatch')
      if (behavior.pkceInvalid || await oidc.calculatePKCECodeChallenge(body.get('code_verifier') ?? '') !== auth.searchParams.get('code_challenge'))
        return json({ error: 'invalid_grant' }, 400)
      const now = Math.floor(Date.now() / 1000)
      const idToken = await new SignJWT({ iss: issuer, sub: 'subject-1', aud: settings.oidcClientId, iat: now, exp: now + 300, nonce: auth.searchParams.get('nonce'), ...behavior.claims }).setProtectedHeader({ alg: 'RS256', kid: 'test' }).sign(behavior.invalidSignature ? wrongPair.privateKey : pair.privateKey)
      return json({ access_token: 'test-access-token', token_type: 'Bearer', expires_in: 300, id_token: idToken })
    }
    if (url === endpoints.userinfo_endpoint)
      return headers.get('authorization') === 'Bearer test-access-token' ? json(behavior.userInfo) : json({}, 401)
    throw new Error('Unexpected provider request')
  })
  vi.stubGlobal('fetch', fetcher)
  function callback(authorization: string) {
    const url = new URL(authorization)
    const code = crypto.randomUUID()
    codes.set(code, url)
    const result = new URL(settings.oidcRedirectUri)
    result.search = new URLSearchParams({ code, state: url.searchParams.get('state')! }).toString()
    return result
  }
  return { settings, behavior, metadata, requests, callback, fetcher }
}
