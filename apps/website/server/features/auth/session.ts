import type { H3Event } from 'h3'
import type { Account } from '../../../shared/auth/model'
import { AdminError, sha256 } from '../../../shared/admin/model'
import { adminEmails, AuthError } from '../../../shared/auth/model'
import { protectIdToken } from './crypto'
import { authCookieOptions, requireAuthOrigin, withAuth } from './http'
import { oidcSettings } from './settings'

export const sessionCookie = 'mukuchi:session:v2'
export function isLocal(event: H3Event) {
  if (!import.meta.dev)
    return false
  const proof = useRuntimeConfig(event).adminLocalProof
  return !!proof && getHeader(event, 'x-mukuchi-local-proof') === proof
}
export async function createSession(event: H3Event, userId: string | null, identity?: { issuer: string, idToken: string }) {
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`
  const csrf = crypto.randomUUID()
  const hash = await sha256(token)
  const config = useRuntimeConfig(event)
  const maxAge = Number(config.authSessionMaxAge || 28800)
  if (!Number.isInteger(maxAge) || maxAge < 300 || maxAge > 604800)
    throw new AuthError(503, '会话有效期配置无效')
  const encrypted = identity ? await protectIdToken(identity.idToken, oidcSettings(event).authSessionKey) : null
  const oldToken = getCookie(event, sessionCookie)
  const oldHash = oldToken ? await sha256(oldToken) : null
  await withAuth(event, repo => repo.saveSession(hash, userId, csrf, Date.now() + maxAge * 1000, identity?.issuer ?? null, encrypted, oldHash))
  setCookie(event, sessionCookie, token, authCookieOptions(event, maxAge))
}
export async function session(event: H3Event) {
  const token = getCookie(event, sessionCookie)
  if (!token || token.length > 100)
    return null
  const hash = await sha256(token)
  return withAuth(event, async (repo) => {
    const row = await repo.session(hash)
    if (!row || (row.local === 1 && !isLocal(event)))
      return null
    if (row.local === 1) {
      const user: Account = { id: 'local', name: '本地管理员', email: null, avatar: '', role: 'admin', local: true }
      return { user, csrf: row.csrf, hash, loginProvider: null, ssoLinked: false, centralLogoutAvailable: false }
    }
    const record = row.user_id ? await repo.user(row.user_id) : null
    if (!record || record.disabled)
      return null
    const user: Account = { id: record.id, name: record.name, email: record.email, avatar: record.avatar, role: adminEmails(useRuntimeConfig(event).authAdminEmails).includes(record.email) ? 'admin' : 'user', local: false }
    const issuer = useRuntimeConfig(event).oidcIssuer
    if (row.oidc_issuer && row.oidc_issuer !== issuer)
      return null
    return { user, csrf: row.csrf, hash, loginProvider: row.oidc_issuer ? 'sso' as const : row.login_provider, ssoLinked: await repo.linked(user.id, issuer || ''), centralLogoutAvailable: !!row.encrypted_id_token }
  })
}
export async function requireAuthSession(event: H3Event) {
  const current = await session(event)
  if (!current)
    throw new AuthError(401, '请先登录', 'expired')
  requireAuthOrigin(event)
  if (getHeader(event, 'x-csrf-token') !== current.csrf)
    throw new AuthError(403, '会话校验失败，请刷新后重试', 'expired')
  return current
}
export async function requireOwner(event: H3Event) {
  const current = await session(event)
  if (!current)
    throw new AdminError(401, '请先登录')
  if (current.user.role !== 'admin')
    throw new AdminError(403, '仅管理员可以访问后台')
  if (!['GET', 'HEAD'].includes(event.method)) {
    try {
      requireAuthOrigin(event)
    }
    catch { throw new AdminError(403, '仅接受同源请求') }
    if (getHeader(event, 'x-csrf-token') !== current.csrf)
      throw new AdminError(403, '会话校验失败，请刷新后重试')
  }
  return current
}
export async function logout(event: H3Event, csrf = getHeader(event, 'x-csrf-token')) {
  requireAuthOrigin(event)
  const token = getCookie(event, sessionCookie)
  const row = token ? await withAuth(event, async repo => repo.session(await sha256(token))) : null
  if (row && csrf !== row.csrf)
    throw new AuthError(403, '会话校验失败')
  if (token)
    await withAuth(event, async repo => repo.removeSession(await sha256(token)))
  deleteCookie(event, sessionCookie, authCookieOptions(event, 0))
  return row
}
