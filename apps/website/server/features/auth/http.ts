import type { EventHandlerResponse, H3Event } from 'h3'
import { z } from 'zod'
import { openDatabase } from '#admin-driver'
import { AuthError } from '../../../shared/auth/model'
import { readBoundedStream } from '../admin/body'
import { adminOptions } from '../admin/http'
import { logApiError } from '../logging/api-error'
import { createAuthRepository } from './repository'

export function defineAuthHandler<T extends EventHandlerResponse>(handler: (event: H3Event) => T | Promise<T>) {
  return defineEventHandler(async (event) => {
    setResponseHeader(event, 'cache-control', 'no-store')
    try {
      return await handler(event)
    }
    catch (cause) {
      const error = cause instanceof AuthError ? cause : cause instanceof z.ZodError ? new AuthError(400, '请求内容无效') : new AuthError(503, '账号服务暂时不可用，请稍后重试')
      logApiError(event, cause, error.statusCode)
      setResponseStatus(event, error.statusCode)
      return { statusCode: error.statusCode, message: error.message }
    }
  })
}
export async function withAuth<T>(event: H3Event, action: (repository: ReturnType<typeof createAuthRepository>) => Promise<T>): Promise<T> {
  const db = openDatabase(adminOptions(event))
  try {
    return await action(createAuthRepository(db))
  }
  finally { db.close() }
}
export function requireAuthOrigin(event: H3Event) {
  if (getHeader(event, 'origin') !== getRequestURL(event).origin || getHeader(event, 'sec-fetch-site') === 'cross-site')
    throw new AuthError(403, '仅接受同源请求')
}
export async function readAuthJson(event: H3Event): Promise<unknown> {
  if (!getHeader(event, 'content-type')?.toLowerCase().startsWith('application/json'))
    throw new AuthError(415, '请求必须使用 JSON')
  const bytes = await readBoundedStream(getRequestWebStream(event), 4096)
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown
  }
  catch { throw new AuthError(400, 'JSON 格式无效') }
}
export function authCookieOptions(event: H3Event, maxAge: number) {
  return { httpOnly: true, sameSite: 'lax' as const, secure: getRequestURL(event).protocol === 'https:', path: useRuntimeConfig(event).app.baseURL, maxAge }
}
