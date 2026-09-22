import type { H3Event } from 'h3'
import { queryCollection } from '@nuxt/content/server'
import { openStatsDatabase } from '#stats-driver'
import { taxonomyPath } from '../../../shared/content/taxonomy'
import { normalizeStatsPath, statsEnabled } from '../../../shared/stats/model'
import { adminEnabled } from '../admin/http'
import { session } from '../auth/session'
import { createStatsRepository, StatsEventConflict } from './repository'

export function requireStats(event: H3Event) {
  setResponseHeader(event, 'cache-control', 'no-store')
  const config = useRuntimeConfig(event)
  if (!statsEnabled(config.public.statsEnabled))
    throw createError({ statusCode: 404, message: '统计功能未启用' })
  return config
}

export async function withStats<T>(event: H3Event, action: (repository: ReturnType<typeof createStatsRepository>) => Promise<T>): Promise<T> {
  const config = requireStats(event)
  try {
    const cloudflare: unknown = event.context.cloudflare
    const env = cloudflare && typeof cloudflare === 'object' && 'env' in cloudflare ? cloudflare.env : null
    const binding = env && typeof env === 'object' && 'STATS_DB' in env ? env.STATS_DB : null
    const db = openStatsDatabase({ filename: config.statsDatabasePath, binding })
    try {
      return await action(createStatsRepository(db))
    }
    finally {
      db.close()
    }
  }
  catch (error) {
    if (error instanceof StatsEventConflict)
      throw createError({ statusCode: 409, message: error.message })
    // Do not include SQL, cookie values or secrets in public errors or request logs.
    console.error('[stats] 数据库操作失败')
    throw createError({ statusCode: 503, message: '统计数据暂时不可用' })
  }
}

export async function requireStatsPath(event: H3Event, input: unknown): Promise<string> {
  let path: string
  try {
    if (typeof input !== 'string' || input.length > 2048)
      throw new Error('invalid path')
    path = normalizeStatsPath(input)
  }
  catch {
    throw createError({ statusCode: 400, message: '页面路径无效' })
  }
  if (['/posts', '/about', '/use', '/categories', '/tools'].includes(path))
    return path
  let exists: boolean
  try {
    const posts = await queryCollection(event, 'posts').select('path', 'tags', 'categories').all()
    exists = posts.some(post => normalizeStatsPath(post.path) === path
      || post.tags.some(tag => taxonomyPath('tag', tag) === path)
      || post.categories.some(category => taxonomyPath('category', category) === path))
  }
  catch {
    throw createError({ statusCode: 503, message: '页面索引暂时不可用' })
  }
  if (!exists)
    throw createError({ statusCode: 404, message: '页面不存在' })
  return path
}

export function requireStatsOrigin(event: H3Event) {
  const url = getRequestURL(event)
  const origin = getHeader(event, 'origin')
  if (!origin || origin !== url.origin || getHeader(event, 'sec-fetch-site') === 'cross-site')
    throw createError({ statusCode: 403, message: '仅接受同源请求' })
}

export async function visitorDigest(id: string, secret: string): Promise<string> {
  if (secret.length < 32)
    throw createError({ statusCode: 503, message: '统计标识配置不可用' })
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const hash = await crypto.subtle.sign('HMAC', key, encoder.encode(id))
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function requireStatsAdmin(event: H3Event) {
  const config = requireStats(event)
  if (adminEnabled(event) && !getHeader(event, 'authorization')) {
    const current = await session(event)
    if (current?.user.owner)
      return
    if (current)
      throw createError({ statusCode: 403, message: '仅站主可以查询统计数据' })
  }
  if (!config.statsAdminToken)
    throw createError({ statusCode: 404, message: '统计查询接口未启用' })
  // Hash both values to a fixed length before comparison.
  const encoder = new TextEncoder()
  const hashes = await Promise.all([getHeader(event, 'authorization') ?? '', `Bearer ${config.statsAdminToken}`]
    .map(value => crypto.subtle.digest('SHA-256', encoder.encode(value))))
  const left = new Uint8Array(hashes[0]!)
  const right = new Uint8Array(hashes[1]!)
  let difference = 0
  for (let index = 0; index < left.length; index++) difference |= left[index]! ^ right[index]!
  if (difference !== 0)
    throw createError({ statusCode: 401, message: '无权查询统计数据' })
}
