import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import process from 'node:process'
import { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import { counter, pageStatsSchema, recordedSchema, shanghaiDay, summarySchema, visitorCookie } from '../shared/stats/model.ts'
import './stats-environment.ts'

const root = new URL(process.env.MUKUCHI_SMOKE_URL || 'http://127.0.0.1:8787')
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(root.hostname), '统计写入验收仅允许本地地址')
const adminToken = process.env.NUXT_STATS_ADMIN_TOKEN
assert.ok(adminToken, '本地验收需要 NUXT_STATS_ADMIN_TOKEN')
const url = (path: string) => new URL(`${root.pathname.replace(/\/$/, '')}${path}`, root)
const content = new DatabaseSync('.data/content/contents.sqlite', { readOnly: true })
const article = z.string().parse(content.prepare('SELECT path FROM _content_posts ORDER BY path LIMIT 1').get()?.path)
content.close()
const cookie = `${visitorCookie}=${randomUUID()}`
async function getSummary() {
  const response = await fetch(url('/api/stats/summary'))
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(response.headers.get('set-cookie'), null)
  return summarySchema.parse(await response.json())
}
async function post(body: unknown, headers: Record<string, string> = {}) {
  const response = await fetch(url('/api/stats/pageview'), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'origin': root.origin, cookie, ...headers },
    body: JSON.stringify(body),
  })
  assert.equal(response.headers.get('cache-control'), 'no-store', `采集响应 ${response.status} 不得缓存`)
  return response
}
const baseline = await getSummary()
const pageBefore = pageStatsSchema.parse(await (await fetch(url(`/api/stats/page?path=${encodeURIComponent(article)}`))).json())
const event = { eventId: randomUUID(), path: article }
const concurrent = await Promise.all(Array.from({ length: 10 }, () => post(event)))
for (const response of concurrent) {
  assert.equal(response.status, 200)
  recordedSchema.parse(await response.json())
}
assert.equal((await getSummary()).pageViews, baseline.pageViews + 1)
assert.equal((await post({ ...event, path: '/about' })).status, 409)
for (const [path, nextCookie] of [[article, cookie], ['/about', `${visitorCookie}=${randomUUID()}`], ['/posts', ''], ['/use', cookie]] as const) {
  const response = await post({ eventId: randomUUID(), path }, { cookie: nextCookie })
  assert.equal(response.status, 200)
  recordedSchema.parse(await response.json())
}
const after = await getSummary()
assert.equal(after.pageViews, baseline.pageViews + 5)
assert.equal(after.visitors, baseline.visitors + 2)
assert.equal(pageStatsSchema.parse(await (await fetch(url(`/api/stats/page?path=${encodeURIComponent(article)}`))).json()).pageViews, pageBefore.pageViews + 2)
assert.equal((await post({ eventId: randomUUID(), path: '/does-not-exist' })).status, 404)
assert.equal((await post({ eventId: randomUUID(), path: '/tags/%2F' })).status, 400)
assert.equal((await post(event, { origin: 'https://invalid.example' })).status, 403)
assert.equal((await post(event, { origin: '' })).status, 403)
assert.equal((await post({ ...event, occurredAt: 0 })).status, 400)
assert.equal((await post(event, { cookie: `${visitorCookie}=invalid` })).status, 400)
assert.equal((await post(event, { 'content-type': 'text/plain' })).status, 415)
assert.equal((await post({ data: 'x'.repeat(5000) })).status, 413)
assert.equal((await fetch(url('/api/admin/stats'))).status, 401)
assert.equal((await fetch(url('/api/admin/stats'), { headers: { authorization: 'Bearer invalid' } })).status, 401)
const headers = { authorization: `Bearer ${adminToken}` }
assert.equal((await fetch(url('/api/admin/stats?from=2026-02-30'), { headers })).status, 400)
const today = shanghaiDay(Date.now())
const response = await fetch(url(`/api/admin/stats?from=${today}&to=${today}&pageSize=100`), { headers })
assert.equal(response.status, 200)
assert.equal(response.headers.get('cache-control'), 'no-store')
const report = z.object({
  total: summarySchema,
  summary: z.object({ pageViews: counter, visitors: counter }),
  daily: z.array(z.object({ day: z.string(), pageViews: counter, visitors: counter })),
  pages: z.array(z.object({ path: z.string(), pageViews: counter, visitors: counter })),
}).parse(await response.json())
assert.deepEqual(report.total, after)
assert.equal(report.daily[0]?.day, today)
assert.ok(report.pages.some(page => page.path === '/about'))
assert.ok(report.pages.some(page => page.path === '/use'))
assert.equal((await getSummary()).pageViews, after.pageViews, '无效请求和只读查询不得产生访问')
console.log('统计 HTTP 验收通过：并发去重、PV/UV、页面计数、鉴权、输入校验、查询与响应头。')
