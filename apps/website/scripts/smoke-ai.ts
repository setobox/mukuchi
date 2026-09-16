import type { Draft } from '../shared/admin/model.ts'
import type { AiSettingsView, SummaryState } from '../shared/ai/model.ts'
import assert from 'node:assert/strict'
import process from 'node:process'
import { DatabaseSync } from 'node:sqlite'
import { decryptApiKey } from '../server/features/ai/crypto.ts'
import { defaultAiSettings } from '../shared/ai/model.ts'

const origin = new URL(process.env.MUKUCHI_SMOKE_URL || 'http://localhost:3000').origin
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname), '摘要写入验收仅允许本地地址')
const database = new DatabaseSync(process.env.NUXT_ADMIN_DATABASE_PATH || '.data/admin.sqlite')
const previous = database.prepare('SELECT config, encrypted_key, version FROM admin_ai_settings WHERE id = 1').get()
const cacheCount = database.prepare('SELECT COUNT(*) AS total FROM admin_ai_cache').get()!.total
let cookie = ''
let csrf = ''
let draft: Draft | undefined
async function call(path: string, method = 'GET', body?: unknown, expected = 200, headers: Record<string, string> = {}) {
  const response = await fetch(`${origin}${path}`, { method, headers: { origin, cookie, 'x-csrf-token': csrf, 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) })
  assert.equal(response.status, expected, `${path}: ${await response.clone().text()}`)
  assert.match(response.headers.get('cache-control') ?? '', /no-store/)
  return response
}
try {
  await call('/api/admin/ai/settings', 'GET', undefined, 401)
  const login = await call('/api/auth/local', 'POST', undefined, 200, { 'x-admin-request': '1' })
  cookie = login.headers.get('set-cookie')!.split(';')[0]!
  csrf = (await (await call('/api/auth/session')).json() as { csrf: string }).csrf
  let settings = await (await call('/api/admin/ai/settings')).json() as AiSettingsView
  assert.equal(settings.encryptionReady, true, '本地服务须加载 NUXT_AI_ENCRYPTION_KEY')
  const fixture = { ...defaultAiSettings, enabled: true, baseUrl: 'https://example.invalid/v1', model: 'smoke-fixture', apiKey: 'local-smoke-key-never-send' }
  await call('/api/admin/ai/settings', 'PUT', { ...fixture, version: settings.version }, 403, { 'x-csrf-token': 'invalid' })
  await call('/api/admin/ai/settings', 'PUT', { ...fixture, version: settings.version }, 403, { origin: 'https://untrusted.example' })
  settings = await (await call('/api/admin/ai/settings', 'PUT', { ...fixture, version: settings.version })).json() as AiSettingsView
  assert.equal(settings.keyConfigured, true)
  assert.ok(!JSON.stringify(settings).includes(fixture.apiKey))
  assert.deepEqual(Object.keys(settings).sort(), ['baseUrl', 'enabled', 'encryptionReady', 'keyConfigured', 'model', 'prompt', 'version'])
  const encrypted = String(database.prepare('SELECT encrypted_key FROM admin_ai_settings WHERE id = 1').get()!.encrypted_key)
  assert.ok(!encrypted.includes(fixture.apiKey))
  assert.equal(await decryptApiKey(encrypted, process.env.NUXT_AI_ENCRYPTION_KEY || ''), fixture.apiKey)
  await call('/api/admin/ai/settings', 'PUT', { ...fixture, version: settings.version - 1 }, 409)
  draft = await (await call('/api/admin/drafts', 'POST', { path: `_ai-smoke-${crypto.randomUUID()}.md` })).json() as Draft
  const path = `/api/admin/drafts/${draft.id}`
  const source = '---\ntitle: 摘要验收\ndescription: 原简介\npublish: 2026-09-16\n---\n\n仅保存在本地私有草稿中的验收正文。\n'
  draft = await (await call(path, 'PUT', { source, version: draft.version })).json() as Draft
  assert.equal((await (await call(`${path}/summary`)).json() as SummaryState).status, 'missing')
  const saved = await (await call(`${path}/summary`, 'POST', { action: 'save', text: '手动摘要验收文本', version: draft.version })).json() as { draft: Draft, summary: SummaryState }
  await call(`${path}/summary`, 'POST', { action: 'save', text: '过期请求', version: draft.version }, 409)
  draft = saved.draft
  assert.equal(saved.summary.status, 'valid')
  assert.ok(draft.source.includes('手动摘要验收文本'))
  const preview = await (await call(`${path}/preview`, 'POST', { source: draft.source })).json() as { data: { description: string, summarySource: string } }
  assert.deepEqual([preview.data.description, preview.data.summarySource], ['手动摘要验收文本', 'ai'])
  settings = await (await call('/api/admin/ai/settings', 'PUT', { ...fixture, apiKey: 'rotated-local-fixture', version: settings.version })).json() as AiSettingsView
  assert.equal((await (await call(`${path}/summary`)).json() as SummaryState).status, 'valid')
  draft = await (await call(path, 'PUT', { source: `${draft.source}\n正文已修改`, version: draft.version })).json() as Draft
  assert.equal((await (await call(`${path}/summary`)).json() as SummaryState).status, 'stale')
  const fallback = await (await call(`${path}/preview`, 'POST', { source: draft.source })).json() as { data: { description: string, summarySource: string } }
  assert.deepEqual([fallback.data.description, fallback.data.summarySource], ['原简介', 'description'])
  draft = await (await call(path, 'PUT', { source: draft.source.replace('title:', 'aiSummary: false\ntitle:'), version: draft.version })).json() as Draft
  assert.equal((await (await call(`${path}/summary`)).json() as SummaryState).status, 'disabled')
  await call(`${path}/summary`, 'POST', { action: 'generate', version: draft.version }, 422)
  assert.equal(database.prepare('SELECT COUNT(*) AS total FROM admin_ai_cache').get()!.total, cacheCount)
}
finally {
  if (draft)
    await call(`/api/admin/drafts/${draft.id}?version=${draft.version}`, 'DELETE')
  if (cookie)
    await call('/api/auth/logout', 'POST')
  database.prepare('DELETE FROM admin_ai_settings WHERE id = 1').run()
  if (previous)
    database.prepare('INSERT INTO admin_ai_settings (id,config,encrypted_key,version) VALUES (1,?,?,?)').run(previous.config!, previous.encrypted_key!, previous.version!)
  database.close()
}
console.log('摘要 HTTP 验收通过：权限、密钥加密与脱敏、版本冲突、手动摘要、预览、过期回退和私有缓存隔离；未调用 AI。')
