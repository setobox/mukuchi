import type { AudioSettings } from '../../../shared/audio/model'
import { z } from 'zod'

export class AudioProviderError extends Error {
  constructor(message: string, public readonly uncertain = false, public readonly retryable = false) {
    super(message)
  }
}
export function speechHeaders(settings: AudioSettings, key: string, resource: string, requestId: string): Record<string, string> {
  return {
    ...(settings.authMode === 'legacy' ? { 'X-Api-App-Id': settings.appId, 'X-Api-Access-Key': key } : { 'X-Api-Key': key }),
    'X-Api-Resource-Id': resource,
    'X-Api-Request-Id': requestId,
  }
}
const responseSchema = z.object({ code: z.number(), data: z.object({ task_id: z.string(), task_status: z.number(), audio_url: z.string().optional() }).optional() })
export function audioDownloadUrl(value: string) {
  const url = new URL(value)
  const domains = ['bytespeech.com', 'bytetos.com', 'volces.com', 'bytedance.com']
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || !domains.some(domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`)))
    throw new AudioProviderError('供应商返回了不受信任的音频地址', true)
  return url.href
}
export function createNarrationProvider(settings: AudioSettings, key: string, request: typeof fetch = fetch) {
  async function call(action: 'submit' | 'query', body: unknown, id: string) {
    let response: Response
    try {
      response = await request(`https://openspeech.bytedance.com/api/v3/tts/${action}`, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(30_000),
        headers: { ...speechHeaders(settings, key, settings.narrationResource, id), 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    }
    catch {
      throw new AudioProviderError('火山连接中断或超时；请查询原任务确认结果', true, true)
    }
    if (!response.ok)
      throw new AudioProviderError(`火山接口返回 HTTP ${response.status}`, action === 'query' || response.status >= 500, response.status === 429 || response.status >= 500)
    let parsed: z.infer<typeof responseSchema>
    try {
      parsed = responseSchema.parse(await response.json())
    }
    catch {
      throw new AudioProviderError('火山返回的任务数据无效', true)
    }
    if (parsed.code !== 20000000)
      throw new AudioProviderError(`火山接口错误码 ${parsed.code}`, action === 'query' || parsed.code >= 50000000, parsed.code === 45000000 || parsed.code >= 50000000)
    if (!parsed.data || parsed.data.task_id !== id)
      throw new AudioProviderError('火山任务标识不匹配', true)
    return parsed.data
  }
  return {
    async submit(text: string, id: string) {
      if (!text.trim() || Array.from(text).length > 100_000)
        throw new AudioProviderError('朗读文本须为 1–100,000 字符')
      await call('submit', { user: { uid: 'mukuchi' }, unique_id: id, req_params: {
        text,
        speaker: settings.narrationSpeaker,
        audio_params: { format: 'mp3', sample_rate: 24000 },
        additions: JSON.stringify({ aigc_watermark: true }),
      } }, id)
    },
    async query(id: string) {
      const data = await call('query', { task_id: id }, id)
      if (data.task_status === 2 && data.audio_url)
        return audioDownloadUrl(data.audio_url)
      if (data.task_status === 0 || data.task_status === 1)
        return null
      throw new AudioProviderError(`朗读任务未成功，状态 ${data.task_status}`)
    },
  }
}
