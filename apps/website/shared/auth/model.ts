import { z } from 'zod'

// Legacy providers are read only, for migration of existing sessions.
export const providerSchema = z.enum(['sso', 'github', 'google'])
export type AuthProvider = z.infer<typeof providerSchema>
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254))
export const avatarSchema = z.string().max(2048).refine(value => !value || (URL.canParse(value) && new URL(value).protocol === 'https:'))
export const profileSchema = z.object({
  issuer: z.url(),
  subject: z.string().min(1).max(255),
  email: emailSchema,
  name: z.string().min(1).max(200),
  avatar: avatarSchema,
  trustedEmail: z.boolean(),
})
export type AuthProfile = z.infer<typeof profileSchema>
export const userSchema = z.object({ id: z.uuid(), email: emailSchema, name: z.string(), avatar: avatarSchema, disabled: z.number() })
export type AuthUser = z.infer<typeof userSchema>
export interface Account {
  id: string
  name: string
  email: string | null
  avatar: string
  role: 'admin' | 'user'
  local: boolean
}
export interface SessionInfo {
  user: Account | null
  loginProvider: AuthProvider | null
  csrf: string | null
  localAvailable: boolean
  ssoAvailable: boolean
  ssoLinked: boolean
  centralLogoutAvailable: boolean
}
export function emptySession(): SessionInfo {
  return { user: null, loginProvider: null, csrf: null, localAvailable: false, ssoAvailable: false, ssoLinked: false, centralLogoutAvailable: false }
}
export class AuthError extends Error {
  constructor(public statusCode: number, message: string, public code = 'failed') { super(message) }
}
export const authMessages: Record<string, string> = {
  failed: '登录失败，请稍后重试。',
  cancelled: '已取消授权，可以重新使用 MU³ ID 登录。',
  expired: '登录请求已失效，请重新登录。',
  email: '请先在 MU³ ID 设置并验证邮箱。',
  link: '此邮箱已有本站账号，请在原账号的有效会话中绑定 MU³ ID；会话已过期时请联系站点管理员验证账号归属。',
  conflict: '此登录方式已关联其他账号，无法继续关联。',
  mismatch: '关联账号的邮箱必须与当前账号一致。',
  disabled: '本站账号已停用，请联系站点管理员。',
  unavailable: 'MU³ ID 登录尚未配置，请稍后重试。',
  logout: '已退出本站，但账号中心暂时无法退出。可前往 MU³ ID 退出。',
}
export function adminEmails(value: unknown): string[] {
  if (typeof value !== 'string' || !value.trim())
    return []
  return z.array(emailSchema).parse(value.split(','))
}
export function safeReturnTo(value: unknown, baseURL = '/'): string {
  const base = baseURL.replace(/\/$/, '')
  const fallback = `${base}/posts`
  if (typeof value !== 'string' || value.length > 2048 || !value.startsWith('/') || /[\\\p{Cc}]/u.test(value))
    return fallback
  try {
    const target = new URL(value, 'https://return.invalid')
    const path = decodeURIComponent(target.pathname)
    if (target.origin !== 'https://return.invalid' || !path.startsWith(`${base}/`) || /[\\\p{Cc}]/u.test(path) || path.startsWith('//') || path.startsWith(`${base}/api/`))
      return fallback
    target.searchParams.delete('auth')
    target.searchParams.delete('auth_error')
    return `${target.pathname}${target.search}${target.hash}`
  }
  catch { return fallback }
}
