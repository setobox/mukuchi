import { z } from 'zod'
import { digest } from '../ai/model'

export const audioKinds = ['narration', 'podcast'] as const
export type AudioKind = typeof audioKinds[number]
export const audioKindSchema = z.enum(audioKinds)
export const audioSettingsSchema = z.object({
  enabled: z.boolean(),
  narrationEnabled: z.boolean(),
  podcastEnabled: z.boolean(),
  authMode: z.enum(['apiKey', 'legacy']),
  appId: z.string().trim().max(200),
  narrationResource: z.string().trim().max(200),
  narrationSpeaker: z.string().trim().max(200),
  podcastResource: z.string().trim().max(200),
  podcastSpeaker1: z.string().trim().max(200),
  podcastSpeaker2: z.string().trim().max(200),
  dailyNarrationCharacters: z.number().int().min(0).max(10_000_000),
  dailyPodcasts: z.number().int().min(0).max(1000),
}).strict()
export type AudioSettings = z.infer<typeof audioSettingsSchema>
export const defaultAudioSettings: AudioSettings = {
  enabled: false,
  narrationEnabled: true,
  podcastEnabled: true,
  authMode: 'apiKey',
  appId: '',
  narrationResource: 'seed-tts-2.0',
  narrationSpeaker: '',
  podcastResource: 'volc.service_type.10050',
  podcastSpeaker1: '',
  podcastSpeaker2: '',
  dailyNarrationCharacters: 0,
  dailyPodcasts: 0,
}
export interface AudioSettingsView extends AudioSettings { version: number, keyConfigured: boolean, encryptionReady: boolean, executionReady: boolean }
export const audioArticleSchema = z.object({
  path: z.string().startsWith('/posts/'),
  title: z.string(),
  inputHash: z.string().regex(/^[a-f0-9]{64}$/),
  narration: z.string(),
  podcast: z.string(),
  narrationEnabled: z.boolean(),
  podcastEnabled: z.boolean(),
})
export type AudioArticle = z.infer<typeof audioArticleSchema>
export interface AudioManifest { revision: string, articles: AudioArticle[] }
export const audioJobSchema = z.object({
  id: z.string(),
  path: z.string(),
  title: z.string(),
  kind: audioKindSchema,
  inputHash: z.string(),
  configHash: z.string(),
  config: z.string(),
  input: z.string(),
  status: z.enum(['queued', 'running', 'succeeded', 'failed', 'unknown', 'cancelled']),
  publication: z.enum(['private', 'review', 'public', 'hidden']),
  phase: z.enum(['pending', 'submitting', 'submitted', 'generated', 'stored']),
  attempt: z.number(),
  version: z.number(),
  providerId: z.string(),
  resultUrl: z.string(),
  objectKey: z.string(),
  size: z.number(),
  progress: z.string(),
  message: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type AudioJob = z.infer<typeof audioJobSchema>
export type AudioJobView = Omit<AudioJob, 'config' | 'input' | 'resultUrl' | 'objectKey'> & { current: boolean, resumable: boolean }
export interface PublicAudio { id: string, kind: AudioKind, url: string }
export function kindEnabled(settings: AudioSettings, kind: AudioKind) {
  return settings.enabled && (kind === 'narration' ? settings.narrationEnabled : settings.podcastEnabled)
}
export async function audioConfigHash(settings: AudioSettings, kind: AudioKind) {
  return digest(JSON.stringify(['audio-v1', kind, settings.authMode, settings.appId, kind === 'narration'
    ? [settings.narrationResource, settings.narrationSpeaker]
    : [settings.podcastResource, settings.podcastSpeaker1, settings.podcastSpeaker2], 'mp3', 24000]))
}
export function audioDay(now: number) {
  return new Date(now + 8 * 3600_000).toISOString().slice(0, 10)
}
export function audioStatusLabel(job: Pick<AudioJob, 'status' | 'publication'>) {
  if (job.status === 'succeeded')
    return { private: '未公开', review: '待试听审核', public: '已公开', hidden: '已隐藏' }[job.publication]
  return { queued: '排队中', running: '生成中', failed: '生成失败', unknown: '需要处理', cancelled: '已取消' }[job.status]
}
