import type { R2Bucket } from '@cloudflare/workers-types'
import type { AudioManifest } from '../../../shared/audio/model'
import type { AudioRepository } from './repository'
import { audioConfigHash, audioSettingsSchema, kindEnabled } from '../../../shared/audio/model'
import { decryptApiKey } from '../ai/crypto'
import { generatePodcast, podcastProgressSchema } from './podcast'
import { audioDownloadUrl, AudioProviderError, createNarrationProvider } from './provider'
import { saveAudio } from './storage'

export interface AudioSteps {
  do: <T extends string | number | boolean | null>(name: string, options: { retries: { limit: number, delay: string, backoff: 'exponential' }, timeout: string }, callback: () => Promise<T>) => Promise<T>
  sleep: (name: string, duration: string) => Promise<void>
}
const once = { retries: { limit: 0, delay: '10 seconds', backoff: 'exponential' as const }, timeout: '50 minutes' }
const safe = { retries: { limit: 3, delay: '10 seconds', backoff: 'exponential' as const }, timeout: '5 minutes' }
export const workflowId = (id: string, attempt: number) => `audio-${id}-${attempt}`
export async function runAudioJob(options: {
  repo: AudioRepository
  bucket: R2Bucket
  step: AudioSteps
  id: string
  attempt: number
  secret: string
  manifest: AudioManifest
  narration?: typeof createNarrationProvider
  podcast?: typeof generatePodcast
  request?: typeof fetch
}) {
  const { repo, bucket, step, id, attempt } = options
  async function activeJob() {
    const job = await repo.job(id)
    if (job.attempt !== attempt || job.status !== 'running')
      throw new Error('Audio execution is no longer current')
    return job
  }
  try {
    const valid = await step.do('validate', safe, async () => {
      const job = await repo.job(id)
      if (job.attempt !== attempt || job.status !== 'running')
        return false
      const { settings } = await repo.settings()
      const article = options.manifest.articles.find(article => article.path === job.path)
      if (!article || article.inputHash !== job.inputHash || !article[`${job.kind}Enabled`] || !kindEnabled(settings, job.kind) || await audioConfigHash(settings, job.kind) !== job.configHash) {
        await repo.fail(job, 'cancelled', '文章或生成配置已变化，任务已取消')
        return false
      }
      return true
    })
    if (!valid)
      return
    const initial = await activeJob()
    // Credentials are only read inside side-effect steps, never returned to Workflow state.
    async function provider() {
      const { encryptedKey } = await repo.settings()
      return { settings: audioSettingsSchema.parse(JSON.parse(initial.config)), key: await decryptApiKey(encryptedKey, options.secret) }
    }
    if (initial.kind === 'narration') {
      await step.do('submit-narration', once, async () => {
        const job = await activeJob()
        if (job.phase !== 'pending')
          return true // A replay must query the existing ID, never resubmit it.
        const { settings, key } = await provider()
        const providerId = crypto.randomUUID()
        await repo.checkpoint(job, { phase: 'submitting', providerId })
        try {
          await (options.narration ?? createNarrationProvider)(settings, key).submit(job.input, providerId)
          await repo.checkpoint(job, { phase: 'submitted' })
        }
        catch (error) {
          if (!(error instanceof AudioProviderError) || !error.uncertain)
            throw error
          // A timed-out POST may already have succeeded. Only query from now on.
        }
        return true
      })
      let ready = false
      for (let poll = 0; poll < 288; poll++) {
        ready = await step.do(`query-${poll}`, safe, async () => {
          const job = await activeJob()
          if (job.phase === 'generated' || job.phase === 'stored')
            return true
          const { settings, key } = await provider()
          const url = await (options.narration ?? createNarrationProvider)(settings, key).query(job.providerId)
          if (url)
            await repo.checkpoint(job, { resultUrl: url, phase: 'generated' })
          return !!url
        })
        if (ready)
          break
        await step.sleep(`poll-wait-${poll}`, poll < 12 ? '10 seconds' : '5 minutes')
      }
      if (!ready)
        throw new AudioProviderError('朗读任务超过等待时限，请检查原任务；不要直接重复提交', true)
    }
    else {
      for (let connection = 0; connection < 3; connection++) {
        const ready = await step.do(`podcast-${connection}`, once, async () => {
          const job = await activeJob()
          if (job.phase === 'generated' || job.phase === 'stored')
            return true
          const { settings, key } = await provider()
          const progress = podcastProgressSchema.parse(job.progress ? JSON.parse(job.progress) : {})
          const resume = job.phase !== 'pending'
          if (resume && (progress.lastRound < 0 || progress.resumes >= 2))
            throw new AudioProviderError('播客未留下可确认的恢复点，需要检查原任务', true)
          const providerId = job.providerId || crypto.randomUUID()
          if (resume)
            progress.resumes++
          await repo.checkpoint(job, { phase: 'submitting', providerId, progress: JSON.stringify(progress) })
          try {
            await (options.podcast ?? generatePodcast)({
              settings,
              key,
              text: job.input,
              taskId: providerId,
              resume,
              lastRound: progress.lastRound,
              progress: async (round) => {
                progress.lastRound = round
                await repo.checkpoint(job, { phase: 'submitted', progress: JSON.stringify(progress) })
              },
              generated: url => repo.checkpoint(job, { phase: 'generated', resultUrl: url }),
            })
            return true
          }
          catch (error) {
            if ((await activeJob()).phase === 'generated')
              return true
            if (error instanceof AudioProviderError && error.retryable && progress.lastRound >= 0 && connection < 2)
              return false
            throw error
          }
        })
        if (ready)
          break
        await step.sleep(`reconnect-${connection}`, '10 seconds')
      }
    }
    await step.do('store-audio', safe, async () => {
      const job = await activeJob()
      const objectKey = `audio/${id}/${attempt}.mp3`
      const existing = await bucket.head(objectKey)
      let size = existing?.size
      if (size === undefined) {
        let url = job.resultUrl
        // Query again on each upload attempt to refresh an expired temporary TTS URL.
        if (job.kind === 'narration') {
          const { settings, key } = await provider()
          url = await (options.narration ?? createNarrationProvider)(settings, key).query(job.providerId) || url
        }
        const response = await (options.request ?? fetch)(audioDownloadUrl(url), { redirect: 'error', signal: AbortSignal.timeout(240_000) })
        size = await saveAudio(bucket, objectKey, response)
      }
      await repo.finish(job, objectKey, size)
      return true
    })
  }
  catch (error) {
    await step.do('record-failure', safe, async () => {
      const job = await repo.job(id)
      if (job.attempt !== attempt || job.status !== 'running')
        return false
      const uncertain = error instanceof AudioProviderError ? error.uncertain : job.phase !== 'pending'
      await repo.fail(job, uncertain ? 'unknown' : 'failed', error instanceof AudioProviderError ? error.message : '音频处理失败，已保存任务进度；请检查服务状态')
      return true
    })
  }
}
