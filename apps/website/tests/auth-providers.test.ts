import type { JWTVerifyGetKey } from 'jose'
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose'
import { beforeAll, expect, test, vi } from 'vite-plus/test'
import { googleProfile, verifyGoogleToken } from '../server/features/auth/providers'

const keys = vi.hoisted(() => ({ resolver: null as JWTVerifyGetKey | null }))
vi.mock('jose', async (original) => {
  const actual = await original<typeof import('jose')>()
  return { ...actual, createRemoteJWKSet: () => (...args: Parameters<JWTVerifyGetKey>) => keys.resolver!(...args) }
})
let pair: Awaited<ReturnType<typeof generateKeyPair>>
beforeAll(async () => {
  pair = await generateKeyPair('RS256')
  keys.resolver = createLocalJWKSet({ keys: [await exportJWK(pair.publicKey)] })
})
async function token(overrides: Record<string, unknown> = {}) {
  return new SignJWT({ sub: 'stable-google-sub', nonce: 'nonce', email: 'Owner@gmail.com', email_verified: true, ...overrides })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer('https://accounts.google.com')
    .setAudience('client')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(pair.privateKey)
}
test('Google 使用签名、issuer、audience、expiry、nonce 及稳定 sub 验证身份', async () => {
  const signed = await token()
  await expect(verifyGoogleToken(signed, 'client', 'nonce')).resolves.toMatchObject({ subject: 'stable-google-sub', email: 'owner@gmail.com', trustedEmail: true, avatar: '' })
  await expect(verifyGoogleToken(signed, 'other-client', 'nonce')).rejects.toThrow()
  await expect(verifyGoogleToken(signed, 'client', 'other-nonce')).rejects.toThrow()
  await expect(verifyGoogleToken(await token({ azp: 'attacker' }), 'client', 'nonce')).rejects.toThrow()
  const badIssuer = await new SignJWT({ sub: 's', nonce: 'nonce' }).setProtectedHeader({ alg: 'RS256' }).setIssuer('https://evil.test').setAudience('client').setIssuedAt().setExpirationTime('5m').sign(pair.privateKey)
  await expect(verifyGoogleToken(badIssuer, 'client', 'nonce')).rejects.toThrow()
  const expired = await new SignJWT({ sub: 's', nonce: 'nonce' }).setProtectedHeader({ alg: 'RS256' }).setIssuer('https://accounts.google.com').setAudience('client').setIssuedAt(1).setExpirationTime(2).sign(pair.privateKey)
  await expect(verifyGoogleToken(expired, 'client', 'nonce')).rejects.toThrow()
  const forgedPair = await generateKeyPair('RS256')
  const forged = await new SignJWT({ sub: 's', nonce: 'nonce' }).setProtectedHeader({ alg: 'RS256' }).setIssuer('https://accounts.google.com').setAudience('client').setIssuedAt().setExpirationTime('5m').sign(forgedPair.privateKey)
  await expect(verifyGoogleToken(forged, 'client', 'nonce')).rejects.toThrow()
})
test('Google 外部邮箱需本站验证，Workspace 依据 hd；未验证邮箱拒绝，缺少头像安全回退', () => {
  const claims = { sub: 'g', email: 'owner@qq.com', email_verified: true }
  expect(googleProfile(claims)).toMatchObject({ trustedEmail: false, avatar: '' })
  expect(googleProfile({ ...claims, email: 'person@company.test', hd: 'company.test' })).toMatchObject({ trustedEmail: true })
  expect(() => googleProfile({ ...claims, email_verified: false })).toThrow()
  expect(() => googleProfile({ sub: 'g' })).toThrow()
  expect(googleProfile({ ...claims, picture: 'javascript:alert(1)' }).avatar).toBe('')
})
