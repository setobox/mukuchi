import type { Pageview, StatsRange } from '../../../shared/stats/model'
import type { Statement, StatsDatabase } from './database'
import { z } from 'zod'
import { counter, pageStatsSchema, shanghaiDay, summarySchema } from '../../../shared/stats/model'

const totalsSql = 'SELECT page_views AS pageViews, visitors, started_at AS startedAt FROM stats_totals WHERE id = 1'
const pageSql = 'SELECT COALESCE((SELECT page_views FROM stats_pages WHERE path = ?), 0) AS pageViews'
const storedSummary = z.object({ pageViews: counter, visitors: counter, startedAt: z.number().int().nullable() })
function summary(row: unknown) {
  const value = storedSummary.parse(row)
  return summarySchema.parse({ ...value, startedAt: value.startedAt === null ? null : new Date(value.startedAt).toISOString() })
}
export class StatsEventConflict extends Error {}

export function createStatsRepository(db: StatsDatabase) {
  return {
    async summary() {
      const results = await db.batch([{ sql: totalsSql }])
      return summary(results[0]?.[0])
    },
    async page(path: string) {
      const results = await db.batch([{ sql: pageSql, params: [path] }])
      return pageStatsSchema.parse({ path, ...results[0]?.[0] })
    },
    async record(event: Pageview, visitorHash: string | null, now: number) {
      const results = await db.batch([
        { sql: 'INSERT INTO stats_events VALUES (?, ?, ?, ?, ?) ON CONFLICT (event_id) DO NOTHING', params: [event.eventId, event.path, visitorHash, now, shanghaiDay(now)] },
        { sql: 'SELECT path, visitor_hash FROM stats_events WHERE event_id = ?', params: [event.eventId] },
        { sql: totalsSql },
        { sql: pageSql, params: [event.path] },
        { sql: 'DELETE FROM stats_events WHERE event_id IN (SELECT event_id FROM stats_events WHERE occurred_at < ? ORDER BY occurred_at LIMIT 250)', params: [now - 7 * 86400000] },
      ])
      const receipt = results[1]?.[0]
      if (receipt?.path !== event.path || receipt.visitor_hash !== visitorHash)
        throw new StatsEventConflict('事件标识已用于其他访问')
      return { summary: summary(results[2]?.[0]), page: pageStatsSchema.parse({ path: event.path, ...results[3]?.[0] }) }
    },
    async report(range: StatsRange) {
      const params = [range.from, range.to]
      const statements: Statement[] = [
        { sql: totalsSql },
        { sql: 'SELECT COALESCE(SUM(page_views), 0) AS pageViews FROM stats_days WHERE day BETWEEN ? AND ?', params },
        { sql: 'SELECT COUNT(DISTINCT visitor_hash) AS visitors FROM stats_visitor_days WHERE day BETWEEN ? AND ?', params },
        { sql: `SELECT d.day, d.page_views AS pageViews,
          (SELECT COUNT(*) FROM stats_visitor_days v WHERE v.day = d.day) AS visitors
          FROM stats_days d WHERE d.day BETWEEN ? AND ? ORDER BY d.day`, params },
        { sql: `SELECT p.path, SUM(p.page_views) AS pageViews,
          (SELECT COUNT(DISTINCT v.visitor_hash) FROM stats_page_visitor_days v
           WHERE v.path = p.path AND v.day BETWEEN ? AND ?) AS visitors
          FROM stats_page_days p WHERE p.day BETWEEN ? AND ? GROUP BY p.path
          ORDER BY pageViews DESC, p.path ASC LIMIT ? OFFSET ?`, params: [...params, ...params, range.pageSize, (range.page - 1) * range.pageSize] },
        { sql: 'SELECT COUNT(DISTINCT path) AS count FROM stats_page_days WHERE day BETWEEN ? AND ?', params },
      ]
      const result = await db.batch(statements)
      const counts = z.object({ pageViews: counter, visitors: counter })
      const days = z.array(counts.extend({ day: z.iso.date() })).parse(result[3])
      const dayMap = new Map(days.map(day => [day.day, day]))
      const daily = []
      for (let time = Date.parse(`${range.from}T00:00:00+08:00`); shanghaiDay(time) <= range.to; time += 86400000) {
        const day = shanghaiDay(time)
        daily.push(dayMap.get(day) ?? { day, pageViews: 0, visitors: 0 })
      }
      return {
        ...range,
        total: summary(result[0]?.[0]),
        summary: counts.parse({ ...result[1]?.[0], ...result[2]?.[0] }),
        daily,
        pages: z.array(counts.extend({ path: z.string() })).parse(result[4]),
        totalPages: counter.parse(result[5]?.[0]?.count),
      }
    },
  }
}
