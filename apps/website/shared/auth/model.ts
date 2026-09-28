import { z } from 'zod'

export const providerSchema = z.enum(['github', 'google'])
export type AuthProvider = z.infer<typeof providerSchema>
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254))
export const avatarSchema = z.string().max(2048).refine(value => !value || (URL.canParse(value) && new URL(value).protocol === 'https:'))
export const profileSchema = z.object({
  provider: providerSchema,
  subject: z.string().min(1).max(255),
  email: emailSchema,
  name: z.string().min(1).max(200),
  avatar: avatarSchema,
  trustedEmail: z.boolean(),
})
export type AuthProfile = z.infer<typeof profileSchema>
export const userSchema = z.object({ id: z.uuid(), email: emailSchema, name: z.string(), avatar: avatarSchema })
export type AuthUser = z.infer<typeof userSchema>
export interface Account {
  id: string
  name: string
  email: string | null
  avatar: string
  role: 'admin' | 'user'
  local: boolean
}
export interface PendingVerification { email: string, expiresAt: number, resendAfter: number, csrf: string }
export interface SessionInfo {
  user: Account | null
  csrf: string | null
  localAvailable: boolean
  providers: Record<AuthProvider, boolean>
  linkedProviders: AuthProvider[]
  pendingVerification: PendingVerification | null
}
export function emptySession(): SessionInfo {
  return { user: null, csrf: null, localAvailable: false, providers: { github: false, google: false }, linkedProviders: [], pendingVerification: null }
}
export class AuthError extends Error {
  constructor(public statusCode: number, message: string, public code = 'failed') { super(message) }
}
export const authMessages: Record<string, string> = {
  failed: '登录失败，请稍后重试。',
  cancelled: '已取消授权，可以选择其他方式登录。',
  expired: '登录请求已失效，请重新登录。',
  email: '请先在登录平台设置并验证主邮箱。',
  link: '此邮箱已有账号，请先使用原登录方式登录，再在账号菜单中关联 Google。',
  conflict: '此登录方式已关联其他账号，无法继续关联。',
  mismatch: '关联账号的邮箱必须与当前账号一致。',
  mail: '验证码发送失败，请稍后点击重新发送。',
  unavailable: '此登录方式尚未配置，请选择其他方式。',
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
