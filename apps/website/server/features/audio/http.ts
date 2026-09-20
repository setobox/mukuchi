import type { H3Event } from 'h3'
import type { AudioJob, AudioJobView, AudioKind, AudioSettingsView, PublicAudio } from '../../../shared/audio/model'
import type { AudioEnv } from './cloudflare'
import { z } from 'zod'
import { openDatabase } from '#admin-driver'
import manifest from '#audio-manifest'
import { AdminError } from '../../../shared/admin/model'
import { digest } from '../../../shared/ai/model'
import { audioConfigHash, audioKindSchema, audioSettingsSchema, kindEnabled } from '../../../shared/audio/model'
import { adminOptions, readAdminJson } from '../admin/http'
import { decryptApiKey, encryptApiKey, encryptionReady } from '../ai/crypto'
import { requireOwner } from '../auth/session'
import { audioExecutionReady, dispatchAudio } from './cloudflare'
import { canResumeAudio, createAudioRepository } from './repository'
import { audioResponse } from './storage'

export function audioEnv(event: H3Event): AudioEnv {
  const context: unknown = event.context.cloudflare
  return context && typeof context === 'object' && 'env' in context && context.env && typeof context.env === 'object' ? context.env as AudioEnv : {}
}
export async function withAudio<T>(event: H3Event, action: (repo: ReturnType<typeof createAudioRepository>) => Promise<T>) {
  const db = openDatabase(adminOptions(event))
  try {
    return await action(createAudioRepository(db))
  }
  finally {
    db.close()
  }
}
const articleFor = (job: AudioJob) => manifest.articles.find(article => article.path === job.path && article.inputHash === job.inputHash && article[`${job.kind}Enabled`])
const secret = (event: H3Event) => String(useRuntimeConfig(event).aiEncryptionKey || '')
export async function audioSettingsView(event: H3Event): Promise<AudioSettingsView> {
  const stored = await withAudio(event, repo => repo.settings())
  return { ...stored.settings, version: stored.version, keyConfigured: !!stored.encryptedKey, encryptionReady: await encryptionReady(secret(event)), executionReady: audioExecutionReady(audioEnv(event)) }
}
export async function audioSettingsRoute(event: H3Event) {
  await requireOwner(event)
  if (event.method === 'GET')
    return audioSettingsView(event)
  const input = audioSettingsSchema.extend({ version: z.number().int().nonnegative(), apiKey: z.string().trim().max(4096).optional(), clearKey: z.boolean().optional() }).strict().parse(await readAdminJson(event))
  await withAudio(event, async (repo) => {
    const old = await repo.settings()
    if (old.version !== input.version)
      throw new AdminError(409, '音频设置已修改，请刷新后重试')
    const key = input.apiKey ? await encryptApiKey(input.apiKey, secret(event)) : input.clearKey ? '' : old.encryptedKey
    const settings = audioSettingsSchema.parse(Object.fromEntries(Object.keys(audioSettingsSchema.shape).map(key => [key, input[key as keyof typeof input]])))
    if (settings.enabled) {
      if (!audioExecutionReady(audioEnv(event)))
        throw new AdminError(422, '请先配置 Cloudflare 音频任务、私有存储和服务端功能开关')
      if (!key || (settings.authMode === 'legacy' && !settings.appId) || (!settings.narrationEnabled && !settings.podcastEnabled))
        throw new AdminError(422, '请配置语音凭据并至少开启一种音频类型')
      await decryptApiKey(key, secret(event))
      if (settings.narrationEnabled && (!settings.narrationResource || !settings.narrationSpeaker || settings.dailyNarrationCharacters < 1))
        throw new AdminError(422, '请配置朗读资源、音色和每日字符额度')
      if (settings.podcastEnabled && (!settings.podcastResource || !settings.podcastSpeaker1 || !settings.podcastSpeaker2 || settings.podcastSpeaker1 === settings.podcastSpeaker2 || settings.dailyPodcasts < 1))
        throw new AdminError(422, '请配置播客资源、两个不同音色和每日任务额度')
      if (!old.settings.enabled)
        await repo.synchronize(manifest, true)
    }
    await repo.saveSettings(settings, key, input.version)
  })
  return audioSettingsView(event)
}
export async function audioJobsRoute(event: H3Event) {
  await requireOwner(event)
  if (event.method === 'GET') {
    return withAudio(event, async (repo) => {
      const stored = await repo.settings()
      const hashes = { narration: await audioConfigHash(stored.settings, 'narration'), podcast: await audioConfigHash(stored.settings, 'podcast') }
      const current = await repo.statusJobs(hashes)
      const recent = await repo.jobs()
      const jobs: AudioJobView[] = [...new Map([...current, ...recent].map(job => [job.id, job])).values()].map((job) => {
        const { config: _config, input: _input, resultUrl: _result, objectKey: _object, ...view } = job
        return { ...view, current: !!articleFor(job) && job.configHash === hashes[job.kind], resumable: canResumeAudio(job) }
      })
      return { jobs, articles: manifest.articles.map(({ path, title, narrationEnabled, podcastEnabled }) => ({ path, title, narrationEnabled, podcastEnabled })), usage: await repo.usage(), revision: manifest.revision }
    })
  }
  const input = z.object({ paths: z.array(z.string()).min(1).max(50), kinds: z.array(audioKindSchema).min(1).max(2) }).strict().parse(await readAdminJson(event))
  await withAudio(event, async (repo) => {
    const { settings } = await repo.settings()
    if (!settings.enabled || !audioExecutionReady(audioEnv(event)))
      throw new AdminError(422, '请先启用音频服务')
    if (input.paths.some(path => !manifest.articles.some(article => article.path === path)))
      throw new AdminError(404, '仅能为当前已上线文章生成音频')
    for (const path of new Set(input.paths)) {
      const article = manifest.articles.find(article => article.path === path)!
      for (const kind of new Set(input.kinds)) await repo.enqueue(article, kind, settings)
    }
  })
  await dispatchAudio(audioEnv(event), manifest)
  return { message: '任务已加入队列；重复内容会复用已有任务。' }
}
export async function audioJobRoute(event: H3Event) {
  await requireOwner(event)
  const id = z.string().regex(/^[a-f0-9]{64}$/).parse(getRouterParam(event, 'id'))
  const input = z.object({ action: z.enum(['publish', 'hide', 'retry', 'resume']), version: z.number().int().positive(), acknowledgeCost: z.boolean().default(false) }).strict().parse(await readAdminJson(event))
  await withAudio(event, async (repo) => {
    const job = await repo.job(id)
    const { settings } = await repo.settings()
    if (input.action !== 'hide' && (!articleFor(job) || job.configHash !== await audioConfigHash(settings, job.kind)))
      throw new AdminError(409, '文章或音色配置已变化，请为当前版本创建任务')
    if (input.action === 'resume')
      await repo.resume(id, input.version)
    else if (input.action === 'retry')
      await repo.retry(id, input.version, input.acknowledgeCost)
    else await repo.publish(id, input.version, input.action === 'publish', articleFor(job))
  })
  await dispatchAudio(audioEnv(event), manifest)
  return { ok: true }
}
export async function publicAudioRoute(event: H3Event): Promise<{ items: PublicAudio[] }> {
  setResponseHeader(event, 'cache-control', 'no-store')
  if (!audioExecutionReady(audioEnv(event)))
    return { items: [] }
  const path = z.string().max(500).parse(getQuery(event).path)
  const article = manifest.articles.find(article => article.path === path)
  if (!article)
    return { items: [] }
  return withAudio(event, async (repo) => {
    const { settings } = await repo.settings()
    const rows = await repo.query('SELECT id,kind,config_hash FROM audio_jobs WHERE path = ? AND input_hash = ? AND status = \'succeeded\' AND publication = \'public\'', [path, article.inputHash])
    const items: PublicAudio[] = []
    for (const row of rows) {
      const kind: AudioKind = audioKindSchema.parse(row.kind)
      if (kindEnabled(settings, kind) && article[`${kind}Enabled`] && row.config_hash === await audioConfigHash(settings, kind))
        items.push({ id: String(row.id), kind, url: `${useRuntimeConfig(event).app.baseURL.replace(/\/$/, '')}/api/audio/${String(row.id)}/file` })
    }
    return { items }
  })
}
export async function audioFileRoute(event: H3Event, preview = false) {
  if (!['GET', 'HEAD'].includes(event.method))
    throw new AdminError(405, '音频读取仅支持 GET 和 HEAD')
  if (preview)
    await requireOwner(event)
  const bucket = audioEnv(event).AUDIO_ASSETS
  if (!bucket)
    throw new AdminError(404, '音频不可用')
  const id = z.string().regex(/^[a-f0-9]{64}$/).parse(getRouterParam(event, 'id'))
  const job = await withAudio(event, repo => repo.job(id))
  const { settings } = await withAudio(event, repo => repo.settings())
  if (job.status !== 'succeeded' || !job.objectKey || (!preview && (!audioExecutionReady(audioEnv(event)) || job.publication !== 'public' || !articleFor(job) || !kindEnabled(settings, job.kind) || job.configHash !== await audioConfigHash(settings, job.kind))))
    throw new AdminError(404, '音频不可用')
  const request = new Request(getRequestURL(event), { method: event.method, headers: { ...getRequestHeaders(event) } as Record<string, string> })
  return audioResponse(bucket, job.objectKey, request, preview)
}
export async function audioSyncRoute(event: H3Event) {
  const token = String(useRuntimeConfig(event).audioSyncToken || '')
  const authorization = getHeader(event, 'authorization') ?? ''
  if (token.length < 32 || authorization.length > 4096 || await digest(authorization) !== await digest(`Bearer ${token}`))
    throw new AdminError(401, '部署同步认证失败')
  const input = z.object({ revision: z.string().min(1).max(100) }).strict().parse(await readAdminJson(event))
  if (input.revision !== manifest.revision)
    throw new AdminError(409, '请求的文章版本与当前部署不匹配')
  if (!audioExecutionReady(audioEnv(event)))
    throw new AdminError(503, '音频执行环境未配置')
  await withAudio(event, repo => repo.synchronize(manifest))
  await dispatchAudio(audioEnv(event), manifest)
  return { ok: true, revision: manifest.revision }
}
