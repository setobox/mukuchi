import type { AudioSettings } from '../../../shared/audio/model'
import { z } from 'zod'
import { podcastFrame, readPodcastFrame } from './podcast-protocol'
import { audioDownloadUrl, AudioProviderError, speechHeaders } from './provider'

export const podcastProgressSchema = z.object({ lastRound: z.number().int().default(-1), resumes: z.number().int().default(0) })
export interface PodcastSocket {
  accept: () => void
  send: (data: Uint8Array) => void
  close: (code?: number, reason?: string) => void
  addEventListener: (type: string, listener: (event: { data?: unknown }) => void) => void
}
export type OpenPodcastSocket = (headers: Record<string, string>) => Promise<PodcastSocket>
export const openPodcastSocket: OpenPodcastSocket = async (headers) => {
  const response = await fetch('https://openspeech.bytedance.com/api/v3/sami/podcasttts', {
    headers: { ...headers, Upgrade: 'websocket' },
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  })
  const socket = (response as Response & { webSocket?: PodcastSocket }).webSocket
  if (!socket)
    throw new AudioProviderError(`播客连接失败，HTTP ${response.status}`, false, response.status === 429 || response.status >= 500)
  return socket
}
export async function generatePodcast(options: {
  settings: AudioSettings
  key: string
  text: string
  taskId: string
  lastRound: number
  resume: boolean
  progress: (round: number) => Promise<void>
  generated: (url: string) => Promise<void>
  open?: OpenPodcastSocket
  timeoutMs?: number
}) {
  const { settings, key, text, taskId } = options
  const inputLength = Array.from(text).length
  if (!text.trim() || inputLength > 32_000)
    throw new AudioProviderError('播客文本须为 1–32,000 字符')
  const sessionId = options.resume ? crypto.randomUUID() : taskId
  const socket = await (options.open ?? openPodcastSocket)({
    ...speechHeaders(settings, key, settings.podcastResource, crypto.randomUUID()),
    'X-Api-App-Key': 'aGjiRDfUWi',
    'X-Api-Connect-Id': crypto.randomUUID(),
  })
  return new Promise<string>((resolve, reject) => {
    let settled = false
    let url = ''
    let round = -1
    let chain = Promise.resolve()
    let queued = 0
    let idle: ReturnType<typeof setTimeout>
    const total = setTimeout(() => finish(new AudioProviderError('播客生成超过 45 分钟，请检查原任务', true)), 45 * 60_000)
    function finish(error?: unknown) {
      if (settled)
        return
      settled = true
      clearTimeout(idle)
      clearTimeout(total)
      try {
        socket.close(1000, 'finished')
      }
      catch { /* The peer may already be disconnected. */ }
      if (error)
        reject(error instanceof AudioProviderError ? error : new AudioProviderError('播客任务中断，已保留恢复进度', true))
      else resolve(url)
    }
    function heartbeat() {
      clearTimeout(idle)
      idle = setTimeout(() => finish(new AudioProviderError('播客连接长时间无响应', true, true)), options.timeoutMs ?? 120_000)
    }
    socket.addEventListener('message', (event) => {
      if (settled)
        return
      heartbeat()
      if (!(event.data instanceof ArrayBuffer) || ++queued > 256) {
        finish(new AudioProviderError('播客消息格式或缓冲大小异常', true))
        return
      }
      const bytes = new Uint8Array(event.data)
      chain = chain.then(async () => {
        if (settled)
          return
        const frame = await readPodcastFrame(bytes)
        if (frame.sessionId && frame.sessionId !== sessionId)
          throw new AudioProviderError('播客返回了其他会话的数据', true)
        if ([51, 153].includes(frame.event))
          throw new AudioProviderError('火山拒绝或终止了播客任务，请检查音色、额度和文章内容', true)
        if (frame.event === 50) {
          socket.send(podcastFrame(100, {
            action: 0,
            input_id: taskId,
            input_text: text,
            input_info: { return_audio_url: true, input_text_max_length: inputLength },
            use_head_music: false,
            use_tail_music: false,
            aigc_watermark: true,
            audio_config: { format: 'mp3', sample_rate: 24000, speech_rate: 0 },
            speaker_info: { random_order: false, speakers: [settings.podcastSpeaker1, settings.podcastSpeaker2] },
            ...(options.resume ? { retry_info: { retry_task_id: taskId, last_finished_round_id: options.lastRound } } : {}),
          }, sessionId))
        }
        if (frame.event === 150)
          socket.send(podcastFrame(102, {}, sessionId))
        if (frame.event === 360)
          round = z.number().int().parse(frame.data.round_id)
        if (frame.event === 362) {
          if (frame.data.is_error)
            throw new AudioProviderError('播客轮次生成失败，已保留恢复进度', true)
          if (round >= 0)
            await options.progress(round)
        }
        if (frame.event === 363) {
          const result = z.object({ meta_info: z.object({ audio_url: z.string(), input_metrics: z.object({ input_text_truncated: z.boolean().optional() }).optional() }), input_metrics: z.object({ input_text_truncated: z.boolean().optional() }).optional() }).parse(frame.data)
          if (result.meta_info.input_metrics?.input_text_truncated || result.input_metrics?.input_text_truncated)
            throw new AudioProviderError('供应商截断了文章输入，音频不会公开；请调整文章后重新生成')
          url = audioDownloadUrl(result.meta_info.audio_url)
          await options.generated(url)
        }
        if (frame.event === 152) {
          if (!url)
            throw new AudioProviderError('播客完成但未返回完整音频地址', true)
          socket.send(podcastFrame(2))
          finish()
        }
      }).catch(finish).finally(() => {
        queued--
      })
    })
    socket.addEventListener('error', () => finish(new AudioProviderError('播客连接发生错误', true, true)))
    socket.addEventListener('close', () => {
      void chain.then(() => {
        if (!settled)
          finish(new AudioProviderError('播客连接提前结束', true, true))
      })
    })
    socket.accept()
    heartbeat()
    socket.send(podcastFrame(1))
  })
}
