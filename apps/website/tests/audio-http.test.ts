import type { H3Event } from 'h3'
import type { AdminDatabase } from '../server/features/admin/database'
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test'
import { audioArticle } from '../server/features/audio/content'
import { audioFileRoute, audioJobRoute, audioJobsRoute, audioSettingsRoute, audioSyncRoute, publicAudioRoute } from '../server/features/audio/http'
import { createSession } from '../server/features/auth/session'
import { audioBucket, audioDatabase, audioSettings, audioSource } from './fixtures/audio'
import manifest from './fixtures/audio-manifest'

const state = vi.hoisted(() => ({ db: null as AdminDatabase | null }))
vi.mock('#admin-driver', () => ({ openDatabase: () => ({ batch: state.db!.batch, close() {} }), openStorage: vi.fn() }))
vi.mock('../server/features/audio/cloudflare', async original => ({ ...await original<typeof import('../server/features/audio/cloudflare')>(), dispatchAudio: vi.fn() }))
const cookies = new Map<string, string>()
const headers = new Map<string, string>()
let body: unknown
let id = ''
let fixture: ReturnType<typeof audioDatabase>
const storage = audioBucket()
const event = { method: 'GET', context: { cloudflare: { env: { NUXT_AUDIO_ENABLED: 'true', NUXT_AI_ENCRYPTION_KEY: btoa('a'.repeat(32)), ADMIN_DB: {}, AUDIO_ASSETS: storage.bucket, ARTICLE_AUDIO_WORKFLOW: {} } } } } as unknown as H3Event
beforeEach(async () => {
  fixture = audioDatabase()
  state.db = fixture.db
  await fixture.db.batch([{ sql: 'CREATE TABLE admin_sessions(token_hash TEXT PRIMARY KEY,user_id INTEGER,login TEXT,avatar TEXT,local INTEGER,csrf TEXT,expires_at INTEGER)' }])
  manifest.articles = [await audioArticle('a.md', audioSource)]
  await fixture.repo.saveSettings(audioSettings, '', 0)
  await fixture.repo.synchronize(manifest, true)
  cookies.clear()
  headers.clear()
  body = {}
  id = ''
  event.method = 'GET'
  headers.set('content-type', 'application/json')
  headers.set('origin', 'https://blog.test')
  vi.stubGlobal('useRuntimeConfig', () => ({ aiEncryptionKey: btoa('a'.repeat(32)), audioSyncToken: 'sync-token-'.repeat(4), adminOwnerId: 1, app: { baseURL: '/' } }))
  vi.stubGlobal('getCookie', (_event: H3Event, name: string) => cookies.get(name))
  vi.stubGlobal('setCookie', (_event: H3Event, name: string, value: string) => cookies.set(name, value))
  vi.stubGlobal('getHeader', (_event: H3Event, name: string) => headers.get(name))
  vi.stubGlobal('getRequestHeaders', () => Object.fromEntries(headers))
  vi.stubGlobal('getRequestURL', () => new URL('https://blog.test/api/audio'))
  vi.stubGlobal('getQuery', () => ({ path: manifest.articles[0]?.path }))
  vi.stubGlobal('getRouterParam', () => id)
  vi.stubGlobal('getRequestWebStream', () => new Response(JSON.stringify(body)).body)
  vi.stubGlobal('setResponseHeader', vi.fn())
})
afterEach(() => {
  fixture.db.close()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})
async function login(user = 1) {
  await createSession(event, { id: user, login: 'user', avatar: '', local: false })
  headers.set('x-csrf-token', String((await fixture.repo.query('SELECT csrf FROM admin_sessions WHERE user_id = ?', [user]))[0]!.csrf))
}
async function finishPodcast() {
  const queued = (await fixture.repo.enqueue(manifest.articles[0]!, 'podcast', audioSettings))!
  await fixture.repo.claim()
  await fixture.repo.finish(await fixture.repo.job(queued.id), 'podcast', 3)
  id = queued.id
  storage.objects.set('podcast', new Uint8Array([1, 2, 3]))
  return fixture.repo.job(id)
}
test('匿名及普通用户不能生成、修改配置、审核或读取私有试听；CSRF 阻止站主跨站写入', async () => {
  const job = await finishPodcast()
  event.method = 'POST'
  body = { action: 'publish', version: job.version }
  for (const action of [audioJobsRoute, audioSettingsRoute, audioJobRoute]) await expect(action(event)).rejects.toMatchObject({ statusCode: 401 })
  event.method = 'GET'
  await expect(audioFileRoute(event, true)).rejects.toMatchObject({ statusCode: 401 })
  await login(2)
  await expect(audioJobsRoute(event)).rejects.toMatchObject({ statusCode: 403 })
  await login()
  event.method = 'POST'
  headers.delete('x-csrf-token')
  await expect(audioJobRoute(event)).rejects.toMatchObject({ statusCode: 403 })
  expect((await fixture.repo.job(id)).publication).toBe('review')
})
test('待审播客不进入公开查询和读取，公开后支持读取，隐藏及正文变动立即拒绝', async () => {
  let job = await finishPodcast()
  expect(await publicAudioRoute(event)).toEqual({ items: [] })
  await expect(audioFileRoute(event)).rejects.toMatchObject({ statusCode: 404 })
  await login()
  expect((await audioFileRoute(event, true)).status).toBe(200)
  event.method = 'POST'
  body = { action: 'publish', version: job.version }
  await audioJobRoute(event)
  event.method = 'GET'
  expect((await publicAudioRoute(event)).items).toHaveLength(1)
  expect((await audioFileRoute(event)).status).toBe(200)
  const original = manifest.articles[0]!
  manifest.articles = [await audioArticle('a.md', `${audioSource}新正文`)]
  expect(await publicAudioRoute(event)).toEqual({ items: [] })
  await expect(audioFileRoute(event)).rejects.toMatchObject({ statusCode: 404 })
  manifest.articles = [original]
  job = await fixture.repo.job(id)
  event.method = 'POST'
  body = { action: 'hide', version: job.version }
  await audioJobRoute(event)
  event.method = 'GET'
  await expect(audioFileRoute(event)).rejects.toMatchObject({ statusCode: 404 })
})
test('部署同步拒绝普通会话和错误 SHA，密钥与供应商地址不出现在设置及任务视图', async () => {
  await login()
  body = { revision: 'old-sha' }
  await expect(audioSyncRoute(event)).rejects.toMatchObject({ statusCode: 401 })
  headers.set('authorization', `Bearer ${'sync-token-'.repeat(4)}`)
  await expect(audioSyncRoute(event)).rejects.toMatchObject({ statusCode: 409 })
  expect(await fixture.repo.jobs()).toHaveLength(0)
  body = { revision: manifest.revision }
  expect(await audioSyncRoute(event)).toMatchObject({ ok: true })
  const settings = await audioSettingsRoute(event)
  expect(settings).not.toHaveProperty('encryptedKey')
  expect(settings).not.toHaveProperty('apiKey')
  await finishPodcast()
  const response = await audioJobsRoute(event)
  expect(JSON.stringify(response)).not.toContain('resultUrl')
  expect(JSON.stringify(response)).not.toContain('objectKey')
})

test('音频文件接口拒绝写入方法', async () => {
  event.method = 'POST'
  await expect(audioFileRoute(event)).rejects.toMatchObject({ statusCode: 405 })
  await expect(audioFileRoute(event, true)).rejects.toMatchObject({ statusCode: 405 })
})
