import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import process from 'node:process'

const base = new URL(process.env.MUKUCHI_SMOKE_URL || 'http://localhost:3000')
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(base.hostname), '后台写入验收仅允许本地地址')
const origin = base.origin
const worker = process.env.MUKUCHI_ADMIN_SMOKE_WORKER === 'true'
const workerDraft = { id: randomUUID(), version: 1 }
let cookie = ''
let csrf = ''
if (worker) {
  const token = randomUUID()
  csrf = randomUUID()
  const hash = createHash('sha256').update(token).digest('hex')
  writeFileSync('.data/admin-smoke-session.sql', `INSERT INTO admin_sessions (token_hash,user_id,login,avatar,local,csrf,expires_at) VALUES ('${hash}',83793448,'local-worker-test','',0,'${csrf}',${Date.now() + 300_000});\nINSERT INTO admin_drafts (id,path,source,updated_at) VALUES ('${workerDraft.id}','_worker-smoke-${workerDraft.id}.md','','${new Date().toISOString()}');`)
  const require = createRequire(import.meta.url)
  const wrangler = join(dirname(require.resolve('wrangler/package.json')), 'bin/wrangler.js')
  execFileSync(process.execPath, [wrangler, 'd1', 'execute', 'mukuchi-admin', '--local', '--config', 'wrangler.jsonc', '--persist-to', '.wrangler/state', '--file', '.data/admin-smoke-session.sql'], { stdio: 'pipe', windowsHide: true })
  cookie = `mukuchi:session=${token}`
}
async function call(path: string, options: { method?: string, body?: unknown, anonymous?: boolean, headers?: Record<string, string>, expected?: number } = {}) {
  const headers = { origin, ...(options.anonymous ? {} : { cookie, 'x-csrf-token': csrf }), ...options.headers }
  const response = await fetch(new URL(path, base), { method: options.method ?? 'GET', headers: { ...headers, ...(options.body === undefined ? {} : { 'content-type': 'application/json' }) }, body: options.body === undefined ? undefined : JSON.stringify(options.body) })
  assert.equal(response.status, options.expected ?? 200, `${path}：${await response.clone().text()}`)
  assert.match(response.headers.get('cache-control') ?? '', /no-store/)
  return response
}
await call('/api/admin/articles', { anonymous: true, expected: 401 })
await call('/api/auth/callback?state=invalid&code=invalid', { anonymous: true, expected: 400 })
await call('/api/auth/local', { method: 'POST', headers: { 'x-admin-request': '1', 'x-forwarded-for': '127.0.0.1' }, expected: 403 })
const login = await call('/api/auth/local', { method: 'POST', headers: { 'x-admin-request': '1' }, expected: worker ? 403 : 200 })
if (!worker)
  cookie = login.headers.get('set-cookie')!.split(';')[0]!
const session = await (await call('/api/auth/session')).json() as { user: { owner: boolean }, csrf: string }
assert.equal(session.user.owner, true)
csrf = session.csrf
if (!worker)
  await call('/api/admin/articles')
const draft = worker ? workerDraft : await (await call('/api/admin/drafts', { method: 'POST', body: { path: `_admin-verification-${crypto.randomUUID()}.md` } })).json() as { id: string, version: number }
let version = draft.version
let assetId = ''
try {
  await call(`/api/admin/drafts/${draft.id}`, { method: 'PUT', body: { source: '', version }, headers: { 'x-csrf-token': 'wrong' }, expected: 403 })
  await call(`/api/admin/drafts/${draft.id}`, { method: 'PUT', body: { source: '', version }, headers: { origin: 'https://untrusted.example' }, expected: 403 })
  const source = '---\ntitle: 验收草稿\ndescription: 私有测试\npublish: \'2026-09-16\'\nseries: "Vue / C# 100%"\nseriesOrder: 0\n---\n\n## 正文\n\n私有内容。\n\n::github{repo="nuxt/content"}\n::\n'
  const saved = await (await call(`/api/admin/drafts/${draft.id}`, { method: 'PUT', body: { source, version } })).json() as { version: number }
  await call(`/api/admin/drafts/${draft.id}`, { method: 'PUT', body: { source: '旧版本', version }, expected: 409 })
  version = saved.version
  const validated = await (await call(`/api/admin/drafts/${draft.id}/validate`, { method: 'POST' })).json() as { metadata: { series: string, seriesOrder: number } }
  assert.equal(validated.metadata.series, 'Vue / C# 100%')
  assert.equal(validated.metadata.seriesOrder, 0)
  const reread = await (await call(`/api/admin/drafts/${draft.id}`)).json() as { draft: { source: string } }
  assert.equal(reread.draft.source, source, '系列元数据保存后完整重读')
  const segments = await (await call(`/api/admin/drafts/${draft.id}/segments`, { method: 'POST', body: { source } })).json() as { segments: { raw: boolean, source: string }[] }
  assert.ok(segments.segments.some(part => part.raw && part.source.includes('::github')))
  const bytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXt8AAAAASUVORK5CYII='), char => char.charCodeAt(0))
  const upload = await fetch(new URL(`/api/admin/assets?draftId=${draft.id}`, base), { method: 'POST', headers: { cookie, origin, 'x-csrf-token': csrf, 'content-type': 'application/octet-stream' }, body: bytes })
  assert.equal(upload.status, 200, await upload.clone().text())
  const asset = await upload.json() as { id: string, path: string }
  assetId = asset.id
  await call(`/api/admin/assets/${assetId}`, { anonymous: true, expected: 401 })
  const image = await call(`/api/admin/assets/${assetId}`)
  assert.equal(image.headers.get('content-type'), 'image/png')
  assert.equal((await image.arrayBuffer()).byteLength, bytes.length)
  const beforePreview = await (await call(`/api/admin/drafts/${draft.id}`)).json() as { draft: unknown }
  const preview = await (await call(`/api/admin/drafts/${draft.id}/preview`, { method: 'POST', body: { source: `${source}\n![测试](${asset.path})\n\n\`\`\`ts\nconst unsaved = true\n\`\`\`` } })).json()
  assert.ok(JSON.stringify(preview).includes(`/api/admin/assets/${assetId}`))
  assert.ok(JSON.stringify(preview).includes('shiki'))
  const afterPreview = await (await call(`/api/admin/drafts/${draft.id}`)).json() as { draft: unknown }
  assert.deepEqual(afterPreview.draft, beforePreview.draft, '预览不能保存源码、递增版本或修改时间')
  const clearedSource = source.replace('series: "Vue / C# 100%"\nseriesOrder: 0\n', '')
  const cleared = await (await call(`/api/admin/drafts/${draft.id}`, { method: 'PUT', body: { source: clearedSource, version } })).json() as { version: number }
  version = cleared.version
  const removed = await (await call(`/api/admin/drafts/${draft.id}/validate`, { method: 'POST' })).json() as { metadata: Record<string, unknown> }
  assert(!('series' in removed.metadata) && !('seriesOrder' in removed.metadata), '清空后不残留系列字段')
  await call(`/api/admin/assets/${assetId}`, { method: 'DELETE' })
  assetId = ''
}
finally {
  if (assetId)
    await call(`/api/admin/assets/${assetId}`, { method: 'DELETE' })
  await call(`/api/admin/drafts/${draft.id}?version=${version}`, { method: 'DELETE' })
  await call('/api/auth/logout', { method: 'POST' })
}
await call('/api/admin/articles', { expected: 401 })
console.log('本地后台 HTTP 验收通过：权限、CSRF、草稿版本、MDC、图片暂存与私有预览。')
