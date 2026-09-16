import { z } from 'zod'

export const visitorCookie = 'mukuchi:visitor'
export const uuid = z.uuid()
export const counter = z.number().int().nonnegative().safe()
export const statsEnabled = (value: unknown): boolean => value === true || value === 'true'
export const pageviewSchema = z.object({ eventId: uuid, path: z.string().min(1).max(2048) }).strict()
export const summarySchema = z.object({ pageViews: counter, visitors: counter, startedAt: z.string().datetime().nullable() })
export const pageStatsSchema = z.object({ path: z.string(), pageViews: counter })
export const recordedSchema = z.object({ summary: summarySchema, page: pageStatsSchema })
export type StatsSummary = z.infer<typeof summarySchema>
export type PageStats = z.infer<typeof pageStatsSchema>
export type Pageview = z.infer<typeof pageviewSchema>
export type RecordedStats = z.infer<typeof recordedSchema>

export function shanghaiDay(time: number): string {
  return new Date(time + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

const date = z.iso.date()
export function parseStatsRange(input: unknown, now: number) {
  const today = shanghaiDay(now)
  const defaults = shanghaiDay(now - 29 * 86400000)
  return z.object({
    from: date.default(defaults),
    to: date.default(today),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  }).strict().refine(value => value.from <= value.to && value.to <= today, '日期范围无效').parse(input)
}
export type StatsRange = ReturnType<typeof parseStatsRange>

export function contentCounts(posts: readonly { tags: readonly string[], categories: readonly string[] }[]) {
  return {
    articles: posts.length,
    tags: new Set(posts.flatMap(post => [...post.tags])).size,
    categories: new Set(posts.flatMap(post => [...post.categories])).size,
  }
}

// Keep route segments separate: decoding an entire path could turn %2F into a separator.
export function normalizeStatsPath(input: string): string {
  if (!input.startsWith('/') || input.startsWith('//') || /[?#\\\p{Cc}]/u.test(input) || !input.isWellFormed())
    throw new Error('页面路径无效')
  const parts = input.replace(/\/$/, '').split('/').slice(1).map((part) => {
    const decoded = decodeURIComponent(part)
    if (!decoded || decoded === '.' || decoded === '..' || /[/\\\p{Cc}]/u.test(decoded) || !decoded.isWellFormed())
      throw new Error('页面路径无效')
    return encodeURIComponent(decoded)
  })
  return `/${parts.join('/')}`
}

export function statsNumber(value: number | undefined): string {
  return value === undefined ? '—' : new Intl.NumberFormat('zh-CN').format(value)
}
