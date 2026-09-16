import type { AdminDatabase, PlatformOptions, PrivateStorage, SqlValue } from '../database'
import { AdminError } from '../../../../shared/admin/model'

interface D1Statement { bind: (...values: SqlValue[]) => D1Statement }
interface D1 { prepare: (sql: string) => D1Statement, batch: (statements: D1Statement[]) => Promise<{ success: boolean, results: Record<string, unknown>[] }[]> }
interface Bucket { put: (key: string, bytes: Uint8Array, options: { httpMetadata: { contentType: string } }) => Promise<unknown>, get: (key: string) => Promise<{ arrayBuffer: () => Promise<ArrayBuffer> } | null>, delete: (key: string) => Promise<void> }
export function openDatabase(options: PlatformOptions): AdminDatabase {
  const binding = options.binding
  if (!binding || typeof binding !== 'object' || !('prepare' in binding) || typeof binding.prepare !== 'function' || !('batch' in binding) || typeof binding.batch !== 'function')
    throw new AdminError(503, '后台数据库未配置')
  const db = binding as D1
  return { async batch(statements) {
    const results = await db.batch(statements.map(s => db.prepare(s.sql).bind(...(s.params ?? []))))
    if (results.some(result => !result.success))
      throw new AdminError(503, '后台数据库暂时不可用')
    return results.map(result => result.results)
  }, close: () => {} }
}
export function openStorage(options: PlatformOptions): PrivateStorage {
  const value = options.bucket
  if (!value || typeof value !== 'object' || !('put' in value) || !('get' in value) || !('delete' in value))
    throw new AdminError(503, '图片暂存未配置')
  const bucket = value as Bucket
  return {
    async put(id, bytes, mime) { await bucket.put(id, bytes, { httpMetadata: { contentType: mime } }) },
    async get(id) {
      const object = await bucket.get(id)
      return object ? new Uint8Array(await object.arrayBuffer()) : null
    },
    remove: id => bucket.delete(id),
  }
}
export async function listContent(_options: PlatformOptions): Promise<never> {
  throw new AdminError(403, '生产环境不能读取本地文章')
}
export async function readContent(_options: PlatformOptions, _path: string): Promise<never> {
  throw new AdminError(403, '生产环境不能读取本地文章')
}
export async function publishLocal(_options: PlatformOptions, _input: unknown): Promise<never> {
  throw new AdminError(403, '生产环境不能写入本地文件')
}
