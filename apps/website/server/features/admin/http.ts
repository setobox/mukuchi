import type { EventHandlerResponse, H3Event } from 'h3'
import { ZodError } from 'zod'
import { openDatabase, openStorage } from '#admin-driver'
import { AdminError } from '../../../shared/admin/model'
import { readBoundedStream } from './body'
import { createAdminRepository } from './repository'

export function adminOptions(event: H3Event) {
  const config = useRuntimeConfig(event)
  const context: unknown = event.context.cloudflare
  const env: Record<string, unknown> = context && typeof context === 'object' && 'env' in context && context.env && typeof context.env === 'object' ? context.env as Record<string, unknown> : {}
  return {
    filename: config.adminDatabasePath,
    assetsDirectory: config.adminAssetsDirectory,
    postsDirectory: config.adminPostsDirectory,
    imagesDirectory: config.adminImagesDirectory,
    binding: env.ADMIN_DB,
    bucket: env.ADMIN_ASSETS,
  }
}
export function adminEnabled(event: H3Event) {
  const value: unknown = useRuntimeConfig(event).adminEnabled
  return import.meta.dev || value === true || value === 'true'
}
export function defineAdminHandler<T extends EventHandlerResponse>(handler: (event: H3Event) => T | Promise<T>) {
  return defineEventHandler(async (event) => {
    setResponseHeader(event, 'cache-control', 'no-store')
    try {
      if (!adminEnabled(event))
        throw new AdminError(404, '后台功能未启用')
      return await handler(event)
    }
    catch (error) {
      const failure = error instanceof AdminError
        ? { statusCode: error.statusCode, message: error.message }
        : error instanceof ZodError
          ? { statusCode: 400, message: error.issues.map(issue => issue.message).join('；') }
          : { statusCode: 503, message: '后台服务暂时不可用，请稍后重试' }
      if (failure.statusCode === 503)
        console.error('[admin] 请求处理失败')
      setResponseStatus(event, failure.statusCode)
      return failure
    }
  })
}
export async function withAdmin<T>(event: H3Event, action: (repository: ReturnType<typeof createAdminRepository>) => Promise<T>): Promise<T> {
  const db = openDatabase(adminOptions(event))
  try {
    return await action(createAdminRepository(db))
  }
  finally { db.close() }
}
export const adminStorage = (event: H3Event) => openStorage(adminOptions(event))
export function requireOrigin(event: H3Event) {
  if (getHeader(event, 'origin') !== getRequestURL(event).origin || getHeader(event, 'sec-fetch-site') === 'cross-site')
    throw new AdminError(403, '仅接受同源请求')
}
export async function readLimitedBody(event: H3Event, limit: number): Promise<Uint8Array> {
  const length = getHeader(event, 'content-length')
  if (length && (!/^\d+$/.test(length) || Number(length) > limit))
    throw new AdminError(413, '请求内容过大')
  return readBoundedStream(getRequestWebStream(event), limit)
}
export async function readAdminJson(event: H3Event) {
  if (!getHeader(event, 'content-type')?.toLowerCase().startsWith('application/json'))
    throw new AdminError(415, '请求必须使用 JSON')
  const bytes = await readLimitedBody(event, 2 * 1024 * 1024)
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown
  }
  catch { throw new AdminError(400, 'JSON 格式无效') }
}
