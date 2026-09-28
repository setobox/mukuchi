import type { H3Event } from 'h3'
import type { AuthProfile, PendingVerification } from '../../../shared/auth/model'
import { z } from 'zod'
import { sha256 } from '../../../shared/admin/model'
import { AuthError } from '../../../shared/auth/model'
import { authCookieOptions, readAuthJson, requireAuthOrigin, withAuth } from './http'
import { createSession } from './session'

const verificationCookie = 'mukuchi:verification'
export async function keyedDigest(event: H3Event, value: string) {
  const secret = useRuntimeConfig(event).authSecret
  if (secret.length < 32)
    throw new AuthError(503, '邮箱验证尚未配置', 'unavailable')
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)))].map(n => n.toString(16).padStart(2, '0')).join('')
}
export async function pendingVerification(event: H3Event) {
  const token = getCookie(event, verificationCookie)
  if (!token || token.length > 100)
    return null
  return withAuth(event, async repo => repo.verification(await sha256(token)))
}
export async function verificationInfo(event: H3Event): Promise<PendingVerification | null> {
  const pending = await pendingVerification(event)
  return pending ? { email: pending.email, expiresAt: pending.code_expires_at, resendAfter: pending.send_after, csrf: pending.csrf } : null
}
export async function beginVerification(event: H3Event, profile: AuthProfile, returnTo: string) {
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`
  await withAuth(event, async repo => repo.createVerification(await sha256(token), profile, crypto.randomUUID(), returnTo))
  setCookie(event, verificationCookie, token, authCookieOptions(event, 1800))
  return sha256(token)
}
export async function clearVerification(event: H3Event) {
  const pending = await pendingVerification(event)
  if (pending)
    await withAuth(event, repo => repo.query('DELETE FROM auth_verifications WHERE token_hash = ?', [pending.token_hash]))
  deleteCookie(event, verificationCookie, authCookieOptions(event, 0))
}
function randomCode() {
  // Rejection sampling avoids modulo bias.
  const values = new Uint32Array(1)
  do {
    crypto.getRandomValues(values)
  } while (values[0]! >= 4_294_000_000)
  return String(values[0]! % 1_000_000).padStart(6, '0')
}
export async function sendVerification(event: H3Event, hash: string) {
  const config = useRuntimeConfig(event)
  if (!config.resendApiKey || !config.authEmailFrom)
    throw new AuthError(503, '验证码邮件尚未配置', 'mail')
  const pending = await withAuth(event, repo => repo.verification(hash))
  if (!pending)
    throw new AuthError(400, '注册请求已过期，请重新登录', 'expired')
  const code = randomCode()
  const digest = await keyedDigest(event, `code:${hash}:${code}`)
  // CF's connecting IP is trusted only inside the Workers environment. Node uses the actual socket peer.
  const ip = event.context.cloudflare ? getHeader(event, 'cf-connecting-ip') : event.node.req.socket?.remoteAddress
  const emailHash = await keyedDigest(event, `email:${pending.email}`)
  const ipHash = await keyedDigest(event, `ip:${ip || 'unknown'}`)
  if (!await withAuth(event, repo => repo.reserveMail(hash, emailHash, ipHash, digest)))
    throw new AuthError(429, '发送过于频繁，请稍后再试', 'mail')
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
      headers: { 'authorization': `Bearer ${config.resendApiKey}`, 'content-type': 'application/json', 'idempotency-key': digest },
      body: JSON.stringify({ from: config.authEmailFrom, to: [pending.email], subject: 'mukuchi 邮箱验证码', text: `你的验证码是 ${code}，十分钟内有效。\n\n用于完成 Google 账号注册。如果不是你本人操作，请忽略此邮件。` }),
    })
    if (!response.ok || !z.object({ id: z.string().min(1) }).safeParse(await response.json()).success)
      throw new Error('Delivery failed')
  }
  catch {
    await withAuth(event, repo => repo.mailFailed(hash, digest))
    throw new AuthError(503, '验证码发送失败，请稍后重试', 'mail')
  }
}
async function requirePending(event: H3Event) {
  requireAuthOrigin(event)
  const pending = await pendingVerification(event)
  if (!pending)
    throw new AuthError(400, '注册请求已过期，请重新登录')
  if (getHeader(event, 'x-csrf-token') !== pending.csrf)
    throw new AuthError(403, '验证请求无效，请刷新后重试')
  return pending
}
export async function resendVerification(event: H3Event) {
  const pending = await requirePending(event)
  await sendVerification(event, pending.token_hash)
  return { ok: true }
}
export async function verifyEmail(event: H3Event) {
  const pending = await requirePending(event)
  const { code } = z.object({ code: z.string().regex(/^\d{6}$/) }).parse(await readAuthJson(event))
  const digest = await keyedDigest(event, `code:${pending.token_hash}:${code}`)
  const user = await withAuth(event, repo => repo.completeVerification(pending, digest))
  if (!user) {
    if (pending.code_hash === digest && pending.code_expires_at > Date.now() && pending.attempts < 5 && await withAuth(event, repo => repo.emailExists(pending.email)))
      throw new AuthError(409, '此邮箱已有账号，请先使用原登录方式登录', 'link')
    throw new AuthError(400, '验证码错误、已过期或尝试次数过多，请重新发送')
  }
  await createSession(event, user.id)
  deleteCookie(event, verificationCookie, authCookieOptions(event, 0))
  return { returnTo: pending.return_to }
}
