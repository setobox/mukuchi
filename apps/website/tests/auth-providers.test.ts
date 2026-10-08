import { afterEach, expect, test, vi } from 'vite-plus/test'
import { discoverOidc, oidcProfile } from '../server/features/auth/providers'
import { parseOidcSettings } from '../server/features/auth/settings'
import { mockIdentityProvider, oidcConfig } from './fixtures/oidc'

afterEach(() => vi.unstubAllGlobals())

test('UserInfo 是资料来源，邮箱必须已验证，头像提供兜底', () => {
  const profile = { sub: 'subject', email: ' OWNER@Example.com ', email_verified: true }
  expect(oidcProfile(profile, oidcConfig.oidcIssuer, 'subject')).toMatchObject({ name: 'owner', email: 'owner@example.com', avatar: '' })
  expect(oidcProfile({ ...profile, picture: 'javascript:alert(1)' }, oidcConfig.oidcIssuer, 'subject').avatar).toBe('')
  expect(() => oidcProfile({ ...profile, name: 123 }, oidcConfig.oidcIssuer, 'subject')).toThrow()
  expect(() => oidcProfile({ ...profile, email_verified: false }, oidcConfig.oidcIssuer, 'subject')).toThrow()
  expect(() => oidcProfile(profile, oidcConfig.oidcIssuer, 'other')).toThrow()
})

test.each([
  { oidcClientSecret: '' },
  { oidcClientSecret: 'replace-with-issued-client-secret' },
  { oidcIssuer: 'https://id.test' },
  { oidcIssuer: 'http://remote.test/api/auth' },
  { oidcIssuer: 'http://localhost:5186/api/auth' },
  { oidcIssuer: 'https://id.test/api/auth/' },
  { oidcRedirectUri: 'https://other.test/api/auth/sso/callback' },
  { oidcRedirectUri: 'https://blog.test/api/auth/callback' },
  { oidcPostLogoutRedirectUri: 'https://other.test/' },
  { oidcScopes: 'openid offline_access' },
  { authSessionKey: 'weak' },
  { authSessionMaxAge: 99999999 },
])('拒绝无效生产配置 %j', (override) => {
  expect(() => parseOidcSettings({ ...oidcConfig, ...override }, false)).toThrow()
})

test('开发只允许本机 HTTP，退出地址保留登记时的尾斜杠形式', () => {
  const local = { ...oidcConfig, appOrigin: 'http://localhost:3333', oidcIssuer: 'http://localhost:5186/api/auth', oidcRedirectUri: 'http://localhost:3333/api/auth/sso/callback', oidcPostLogoutRedirectUri: 'http://localhost:3333/' }
  expect(parseOidcSettings(local, true).oidcPostLogoutRedirectUri).toBe(local.oidcPostLogoutRedirectUri)
  expect(() => parseOidcSettings({ ...local, oidcIssuer: 'http://192.168.1.1/api/auth' }, true)).toThrow()
  expect(parseOidcSettings(oidcConfig, false).oidcPostLogoutRedirectUri).toBe('https://blog.test')
})

test('Discovery 检查 issuer 和必要端点，防止不安全传输', async () => {
  const idp = await mockIdentityProvider()
  idp.metadata.issuer = 'https://wrong.test/api/auth'
  await expect(discoverOidc(idp.settings)).rejects.toThrow()
  idp.metadata.issuer = idp.settings.oidcIssuer
  idp.metadata.userinfo_endpoint = 'http://remote.test/userinfo'
  await expect(discoverOidc(idp.settings)).rejects.toThrow()
  idp.metadata.userinfo_endpoint = ''
  await expect(discoverOidc(idp.settings)).rejects.toThrow()
})

test('SDK 校验成功令牌并读取 UserInfo', async () => {
  const idp = await mockIdentityProvider()
  const client = await import('openid-client')
  const { exchangeIdentity } = await import('../server/features/auth/providers')
  const config = await discoverOidc(idp.settings)
  const verifier = client.randomPKCECodeVerifier()
  const state = client.randomState()
  const nonce = client.randomNonce()
  const url = client.buildAuthorizationUrl(config, { redirect_uri: idp.settings.oidcRedirectUri, response_type: 'code', scope: 'openid profile email', state, nonce, code_challenge: await client.calculatePKCECodeChallenge(verifier), code_challenge_method: 'S256' })
  const transaction = { browser_hash: '', verifier, nonce, issuer: idp.settings.oidcIssuer, client_id: idp.settings.oidcClientId, redirect_uri: idp.settings.oidcRedirectUri, user_id: null, session_hash: null, return_to: '/posts', expires_at: Date.now() + 600000 }
  const result = await exchangeIdentity(config, idp.settings, idp.callback(url.href), transaction, state)
  expect(result.profile.email).toBe('owner@example.com')
})
