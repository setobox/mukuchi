import { randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, expect, test } from 'vite-plus/test'
import { openStatsDatabase } from '../server/features/stats/drivers/node'
import { createStatsRepository, StatsEventConflict } from '../server/features/stats/repository'
import { contentCounts, normalizeStatsPath, pageviewSchema, parseStatsRange, shanghaiDay } from '../shared/stats/model'

const fixtures: { close: () => void }[] = []
afterEach(() => fixtures.splice(0).forEach(fixture => fixture.close()))
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'mukuchi-stats-'))
  const filename = join(directory, 'stats.sqlite')
  const connection = new DatabaseSync(filename)
  connection.exec(readFileSync(new URL('../migrations/stats/0001_stats.sql', import.meta.url), 'utf8'))
  const db = openStatsDatabase({ filename, binding: null })
  const repository = createStatsRepository(db)
  fixtures.push({ close: () => {
    db.close()
    connection.close()
    if (!directory.startsWith(join(tmpdir(), 'mukuchi-stats-')))
      throw new Error('临时目录无效')
    rmSync(directory, { recursive: true })
  } })
  return { db, repository, connection, filename }
}
const now = Date.parse('2026-09-16T04:00:00Z')
const visit = (path = '/posts/example') => ({ eventId: randomUUID(), path })

test('内容数量使用完整集合，标签与专栏独立去重，内容增删反映实际数量', () => {
  const posts = [{ tags: ['A', 'A'], categories: ['X', 'Y'] }, { tags: ['A', 'B'], categories: ['X'] }]
  expect(contentCounts(posts)).toEqual({ articles: 2, tags: 2, categories: 2 })
  expect(contentCounts(posts.slice(0, 1))).toEqual({ articles: 1, tags: 1, categories: 2 })
  expect(contentCounts([])).toEqual({ articles: 0, tags: 0, categories: 0 })
})

test('页面标识保留中文和特殊字符语义，拒绝路径注入及额外事件字段', () => {
  expect(normalizeStatsPath('/posts/中文/')).toBe('/posts/%E4%B8%AD%E6%96%87')
  for (const path of ['/tags/C%23', '/tags/C%2B%2B', '/tags/%2523'])
    expect(normalizeStatsPath(path)).toBe(path)
  for (const path of ['//evil.test', '/posts/%2f', '/posts/..', '/posts/%', '/posts/x?q=1', '/posts/x#title', '/posts/%00'])
    expect(() => normalizeStatsPath(path)).toThrow()
  expect(pageviewSchema.safeParse({ ...visit(), timestamp: 0 }).success).toBe(false)
  expect(pageviewSchema.safeParse({ eventId: 'bad', path: '/posts' }).success).toBe(false)
})

test('首次计数、重复事件、不同访客与匿名访问均按约定统计', async () => {
  const { repository } = fixture()
  expect(await repository.summary()).toEqual({ pageViews: 0, visitors: 0, startedAt: null })
  const event = visit()
  const first = await repository.record(event, 'visitor-a', now)
  expect(first.summary).toEqual({ pageViews: 1, visitors: 1, startedAt: new Date(now).toISOString() })
  expect(await repository.record(event, 'visitor-a', now + 100)).toEqual(first)
  await repository.record(visit(), 'visitor-a', now)
  await repository.record(visit(), 'visitor-b', now)
  await repository.record(visit(), null, now)
  expect(await repository.summary()).toMatchObject({ pageViews: 4, visitors: 2 })
  expect(await repository.page(event.path)).toMatchObject({ pageViews: 4 })
})

test('跨页面、跨上海零点的区间 UV 去重，不累加每日 UV', async () => {
  const { repository } = fixture()
  const midnight = Date.parse('2026-09-16T16:00:00Z')
  await repository.record(visit('/about'), 'a', midnight - 1)
  await repository.record(visit('/posts'), 'a', midnight - 1)
  await repository.record(visit('/posts'), 'a', midnight)
  await repository.record(visit('/posts'), 'b', midnight)
  expect(shanghaiDay(midnight - 1)).toBe('2026-09-16')
  const range = parseStatsRange({ from: '2026-09-15', to: '2026-09-17', pageSize: 1 }, midnight)
  const report = await repository.report(range)
  expect(report.summary).toEqual({ pageViews: 4, visitors: 2 })
  expect(report.daily).toEqual([
    { day: '2026-09-15', pageViews: 0, visitors: 0 },
    { day: '2026-09-16', pageViews: 2, visitors: 1 },
    { day: '2026-09-17', pageViews: 2, visitors: 2 },
  ])
  expect(report.pages).toEqual([{ path: '/posts', pageViews: 3, visitors: 2 }])
  expect(report.totalPages).toBe(2)
  expect((await repository.report({ ...range, page: 2 })).pages[0]?.path).toBe('/about')
})

test('事件 ID 冲突不增加计数，批量中途失败回滚事件和全部聚合', async () => {
  const { repository, db } = fixture()
  const event = visit()
  await repository.record(event, 'a', now)
  await expect(repository.record({ ...event, path: '/about' }, 'a', now)).rejects.toBeInstanceOf(StatsEventConflict)
  await expect(repository.record(event, 'b', now)).rejects.toBeInstanceOf(StatsEventConflict)
  await expect(db.batch([
    { sql: 'INSERT INTO stats_events VALUES (?, ?, ?, ?, ?)', params: [randomUUID(), '/about', 'b', now, '2026-09-16'] },
    { sql: 'SELECT * FROM missing_table' },
  ])).rejects.toThrow()
  expect(await repository.summary()).toMatchObject({ pageViews: 1, visitors: 1 })
  expect(await repository.page('/about')).toMatchObject({ pageViews: 0 })
})

test('并发重复提交只记一次，重开数据库与清理过期凭证不丢失累计数据', async () => {
  const { repository, connection, filename } = fixture()
  const event = visit()
  await Promise.all(Array.from({ length: 12 }, () => repository.record(event, 'a', now)))
  await repository.record(visit(), 'a', now + 8 * 86400000)
  expect(connection.prepare('SELECT COUNT(*) AS count FROM stats_events').get()?.count).toBe(1)
  const reopened = openStatsDatabase({ filename, binding: null })
  try {
    expect(await createStatsRepository(reopened).summary()).toMatchObject({ pageViews: 2, visitors: 1 })
  }
  finally {
    reopened.close()
  }
})

test('日期和分页校验拒绝无效日期、未来范围、反向范围及不受支持字段', () => {
  expect(parseStatsRange({}, now)).toMatchObject({ from: '2026-08-18', to: '2026-09-16', page: 1, pageSize: 20 })
  for (const query of [{ from: '2026-02-30' }, { from: '2026-09-17' }, { to: '2026-09-17' }, { page: 0 }, { pageSize: 101 }, { extra: 'x' }])
    expect(() => parseStatsRange(query, now)).toThrow()
})
