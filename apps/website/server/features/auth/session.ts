import type { H3Event } from 'h3'
import type { Account } from '../../../shared/admin/model'
import { AdminError, sha256 } from '../../../shared/admin/model'
import { requireOrigin, withAdmin } from '../admin/http'

const cookieName = 'mukuchi:session'
export function isLocal(event: H3Event) {
  if (!import.meta.dev)
    return false
  const proof = useRuntimeConfig(event).adminLocalProof
  return !!proof && getHeader(event, 'x-mukuchi-local-proof') === proof
}
function cookieOptions(event: H3Event) {
  return { httpOnly: true, sameSite: 'lax' as const, secure: getRequestURL(event).protocol === 'https:', path: useRuntimeConfig(event).app.baseURL, maxAge: 7 * 86400 }
}
export async function createSession(event: H3Event, user: Omit<Account, 'owner'>) {
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`
  const csrf = crypto.randomUUID()
  await withAdmin(event, async (repo) => {
    await repo.query('DELETE FROM admin_sessions WHERE expires_at < ?', [Date.now()])
    await repo.query('INSERT INTO admin_sessions (token_hash,user_id,login,avatar,local,csrf,expires_at) VALUES (?,?,?,?,?,?,?)', [await sha256(token), user.id, user.login, user.avatar, user.local ? 1 : 0, csrf, Date.now() + 7 * 86400_000])
  })
  setCookie(event, cookieName, token, cookieOptions(event))
}
export async function session(event: H3Event) {
  const token = getCookie(event, cookieName)
  if (!token || token.length > 100)
    return null
  const row = await withAdmin(event, async repo => (await repo.query('SELECT user_id,login,avatar,local,csrf FROM admin_sessions WHERE token_hash = ? AND expires_at > ?', [await sha256(token), Date.now()]))[0])
  if (!row || (row.local === 1 && !isLocal(event)))
    return null
  const user: Account = { id: Number(row.user_id), login: String(row.login), avatar: String(row.avatar), local: row.local === 1, owner: row.local === 1 || Number(row.user_id) === Number(useRuntimeConfig(event).adminOwnerId) }
  return { user, csrf: String(row.csrf) }
}
export async function requireOwner(event: H3Event) {
  const current = await session(event)
  if (!current)
    throw new AdminError(401, '请先登录')
  if (!current.user.owner)
    throw new AdminError(403, '仅站主可以访问后台')
  if (!['GET', 'HEAD'].includes(event.method)) {
    requireOrigin(event)
    if (getHeader(event, 'x-csrf-token') !== current.csrf)
      throw new AdminError(403, '会话校验失败，请刷新后重试')
  }
  return current
}
export async function logout(event: H3Event) {
  requireOrigin(event)
  const current = await session(event)
  if (current && getHeader(event, 'x-csrf-token') !== current.csrf)
    throw new AdminError(403, '会话校验失败')
  const token = getCookie(event, cookieName)
  if (token) {
    const hash = await sha256(token)
    await withAdmin(event, repo => repo.query('DELETE FROM admin_sessions WHERE token_hash = ?', [hash]))
  }
  deleteCookie(event, cookieName, cookieOptions(event))
}
