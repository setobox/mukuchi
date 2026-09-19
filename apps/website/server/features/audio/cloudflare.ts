import type { D1Database, R2Bucket, Workflow } from '@cloudflare/workers-types'
import type { AudioManifest } from '../../../shared/audio/model'
import { workflowId } from './engine'
import { createAudioRepository } from './repository'

export interface AudioWorkflowPayload { id: string, attempt: number }
export interface AudioEnv {
  ADMIN_DB?: D1Database
  AUDIO_ASSETS?: R2Bucket
  ARTICLE_AUDIO_WORKFLOW?: Workflow<AudioWorkflowPayload>
  NUXT_AI_ENCRYPTION_KEY?: string
  NUXT_AUDIO_ENABLED?: string
}
export function cloudflareAudioRepository(env: AudioEnv) {
  if (!env.ADMIN_DB)
    throw new Error('Audio database unavailable')
  const db = env.ADMIN_DB
  return createAudioRepository({ close() {}, async batch(statements) {
    const results = await db.batch<Record<string, unknown>>(statements.map(statement => db.prepare(statement.sql).bind(...(statement.params ?? []))))
    if (results.some(result => !result.success))
      throw new Error('Audio database write failed')
    return results.map(result => result.results)
  } })
}
export function audioExecutionReady(env: AudioEnv) {
  return env.NUXT_AUDIO_ENABLED === 'true' && !!env.ADMIN_DB && !!env.AUDIO_ASSETS && !!env.ARTICLE_AUDIO_WORKFLOW && !!env.NUXT_AI_ENCRYPTION_KEY
}
export async function dispatchAudio(env: AudioEnv, manifest: AudioManifest) {
  if (!audioExecutionReady(env))
    return
  const repo = cloudflareAudioRepository(env)
  const job = await repo.claim()
  if (!job)
    return
  const article = manifest.articles.find(article => article.path === job.path)
  if (job.phase === 'pending' && (!article || article.inputHash !== job.inputHash || !article[`${job.kind}Enabled`])) {
    await repo.fail(job, 'cancelled', '文章已更新、关闭音频或删除')
    return
  }
  const id = workflowId(job.id, job.attempt)
  const binding = env.ARTICLE_AUDIO_WORKFLOW!
  try {
    await binding.create({ id, params: { id: job.id, attempt: job.attempt } })
  }
  catch {
    // Creating a named instance is idempotent. Do not restart an existing paid step.
    try {
      const status = await (await binding.get(id)).status()
      if (['errored', 'terminated', 'complete'].includes(status.status)) {
        const latest = await repo.job(job.id)
        if (latest.attempt === job.attempt)
          await repo.fail(latest, latest.phase === 'pending' ? 'failed' : 'unknown', '后台任务已停止，请检查进度后重试')
      }
    }
    catch {
      // Retry uncertain creation for 30 minutes, then require explicit intervention.
      const latest = await repo.job(job.id)
      if (latest.attempt === job.attempt && Date.now() - Date.parse(latest.updatedAt) > 30 * 60_000)
        await repo.fail(latest, latest.phase === 'pending' ? 'failed' : 'unknown', '后台任务启动或状态查询持续失败，请检查 Workflows 后重试')
    }
  }
}
