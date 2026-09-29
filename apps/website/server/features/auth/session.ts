import type { H3Event } from 'h3'
import type { Account, AuthProvider } from '../../../shared/auth/model'
import { AdminError, sha256 } from '../../../shared/admin/model'
import { adminEmails, AuthError } from '../../../shared/auth/model'
import { requireOrigin } from '../admin/http'
import { authCookieOptions, requireAuthOrigin, withAuth } from './http'

export const sessionCookie = 'mukuchi:session:v2'
export function isLocal(event: H3Event) {
  if (!import.meta.dev)
    return false
  const proof = useRuntimeConfig(event).adminLocalProof
  return !!proof && getHeader(event, 'x-mukuchi-local-proof') === proof
}
export async function createSession(event: H3Event, userId: string | null, loginProvider: AuthProvider | null = null) {
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`
  const csrf = crypto.randomUUID()
  const hash = await sha256(token)
  await withAuth(event, repo => repo.saveSession(hash, userId, csrf, Date.now() + 7 * 86400_000, loginProvider))
  setCookie(event, sessionCookie, token, authCookieOptions(event, 7 * 86400))
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
      return { user, csrf: row.csrf, hash, loginProvider: null, linkedProviders: [] }
    }
    const record = row.user_id ? await repo.user(row.user_id) : null
    if (!record)
      return null
    const user: Account = { ...record, role: adminEmails(useRuntimeConfig(event).authAdminEmails).includes(record.email) ? 'admin' : 'user', local: false }
    return { user, csrf: row.csrf, hash, loginProvider: row.login_provider, linkedProviders: await repo.providers(user.id) }
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
    requireOrigin(event)
    if (getHeader(event, 'x-csrf-token') !== current.csrf)
      throw new AdminError(403, '会话校验失败，请刷新后重试')
  }
  return current
}
export async function logout(event: H3Event) {
  requireAuthOrigin(event)
  const current = await session(event)
  if (current && getHeader(event, 'x-csrf-token') !== current.csrf)
    throw new AuthError(403, '会话校验失败')
  const token = getCookie(event, sessionCookie)
  if (token)
    await withAuth(event, async repo => repo.removeSession(await sha256(token)))
  deleteCookie(event, sessionCookie, authCookieOptions(event, 0))
}
