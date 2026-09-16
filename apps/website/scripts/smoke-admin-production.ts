import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import process from 'node:process'
import { z } from 'zod'

const build = z.object({ enabled: z.boolean() }).parse(JSON.parse(readFileSync('.output/admin-build.json', 'utf8')))
if (build.enabled) {
  const origin = new URL(process.env.MUKUCHI_SMOKE_URL || 'https://blog.setobox.me')
  assert.equal(origin.protocol, 'https:')
  const request = (path: string) => fetch(new URL(path, origin), { redirect: 'manual', signal: AbortSignal.timeout(15_000) })
  const session = await request('/api/auth/session')
  assert.equal(session.status, 200, '生产登录接口不可用')
  assert.match(session.headers.get('cache-control') ?? '', /no-store/)
  z.object({ user: z.null(), csrf: z.null(), localAvailable: z.literal(false), loginAvailable: z.literal(true) }).parse(await session.json())
  for (const path of ['/api/admin/articles', '/api/admin/ai/settings', `/api/admin/drafts/${crypto.randomUUID()}/summary`, `/api/admin/assets/${crypto.randomUUID()}`])
    assert.equal((await request(path)).status, 401, '生产后台必须验证会话')
  const page = await request('/admin')
  assert.equal(page.status, 200)
  assert.match(page.headers.get('cache-control') ?? '', /no-store/)
  const statsBuild = z.object({ enabled: z.boolean() }).parse(JSON.parse(readFileSync('.output/stats-build.json', 'utf8')))
  if (statsBuild.enabled)
    assert.equal((await request('/api/stats/summary')).status, 200, '生产统计不可用')
}
console.log('生产后台只读验收通过：登录配置、权限、禁止缓存和统计可用性。')
