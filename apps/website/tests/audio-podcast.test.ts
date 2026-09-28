import type { PodcastSocket } from '../server/features/audio/podcast'
import { expect, test, vi } from 'vite-plus/test'
import { generatePodcast, openPodcastSocket } from '../server/features/audio/podcast'
import { podcastFrame, readPodcastFrame } from '../server/features/audio/podcast-protocol'
import { audioSettings } from './fixtures/audio'

function frame(event: number, payload: unknown = {}, session = 'session') {
  if (event >= 100) {
    const bytes = podcastFrame(event, payload, session)
    bytes[1] = 0x94
    return bytes
  }
  const json = new TextEncoder().encode(JSON.stringify(payload))
  const bytes = new Uint8Array(16 + json.length)
  bytes.set([0x11, 0x94, 0x10, 0])
  const view = new DataView(bytes.buffer)
  view.setUint32(4, event)
  view.setUint32(8, 0)
  view.setUint32(12, json.length)
  bytes.set(json, 16)
  return bytes
}
test('播客二进制协议拒绝截断、错类型和过长数据，正确解析事件及会话', async () => {
  expect(await readPodcastFrame(frame(362, { is_error: false }))).toEqual({ event: 362, sessionId: 'session', data: { is_error: false } })
  expect((await readPodcastFrame(frame(50))).event).toBe(50)
  const bytes = frame(360)
  await expect(readPodcastFrame(bytes.slice(0, -1))).rejects.toThrow()
  await expect(readPodcastFrame(podcastFrame(100))).rejects.toThrow()
  await expect(readPodcastFrame(new Uint8Array(4 * 1024 * 1024 + 1))).rejects.toThrow()
})

function socketFixture(truncated = false, incoming: 'arraybuffer' | 'blob' = 'arraybuffer') {
  const listeners = new Map<string, (event: { data?: unknown }) => void>()
  const sent: Uint8Array[] = []
  const emit = (event: number, data: unknown = {}) => {
    const bytes = frame(event, data)
    listeners.get('message')?.({ data: incoming === 'blob' ? new Blob([bytes]) : bytes.buffer })
  }
  const socket: PodcastSocket = {
    binaryType: 'blob',
    accept() {},
    close: vi.fn(),
    addEventListener(type, listener) {
      listeners.set(type, listener)
    },
    send(bytes) {
      sent.push(bytes)
      const event = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4)
      if (event === 1)
        queueMicrotask(() => emit(50))
      if (event === 100)
        queueMicrotask(() => emit(150))
      if (event === 102) {
        queueMicrotask(() => {
          emit(360, { round_id: 0 })
          emit(362, { is_error: false })
          emit(363, { meta_info: { audio_url: 'https://audio.bytespeech.com/podcast.mp3', input_metrics: { input_text_truncated: truncated } } })
          emit(152)
        })
      }
    },
  }
  return { socket, sent }
}
test('播客 WebSocket 请求使用 Workers 支持的重定向策略', async () => {
  const { socket } = socketFixture()
  const request = vi.fn<typeof fetch>().mockResolvedValue(Object.assign(new Response(null, { status: 200 }), { webSocket: socket }))
  vi.stubGlobal('fetch', request)
  try {
    expect(await openPodcastSocket({ 'X-Api-Key': 'test-key' })).toBe(socket)
    expect(request.mock.calls[0]?.[1]).toMatchObject({ redirect: 'manual' })
  }
  finally {
    vi.unstubAllGlobals()
  }
})
test('播客输入明确传入全文长度和双人音色，保存轮次后接受最终地址', async () => {
  const { socket, sent } = socketFixture()
  const progress = vi.fn(async () => {})
  const generated = vi.fn(async () => {})
  const text = '正文'.repeat(11_000)
  const open = vi.fn(async () => socket)
  await generatePodcast({ settings: audioSettings, key: 'test-key', text, taskId: 'session', lastRound: -1, resume: false, open, progress, generated })
  expect(socket.binaryType).toBe('arraybuffer')
  expect(progress).toHaveBeenCalledWith(0)
  expect(generated).toHaveBeenCalledWith('https://audio.bytespeech.com/podcast.mp3')
  const request = sent.find(bytes => new DataView(bytes.buffer).getUint32(4) === 100)!
  const body = new TextDecoder().decode(request).slice(new TextDecoder().decode(request).indexOf('{'))
  expect(JSON.parse(body)).toMatchObject({ action: 0, input_text: text, input_info: { input_text_max_length: 22_000 }, speaker_info: { speakers: ['host-a', 'host-b'], random_order: false } })
  expect(body).not.toContain('web_search')
})
test('播客在 Workers 默认 Blob 消息格式下仍能完成', async () => {
  const { socket } = socketFixture(false, 'blob')
  const generated = vi.fn(async () => {})
  await generatePodcast({ settings: audioSettings, key: 'test-key', text: '正文', taskId: 'session', lastRound: -1, resume: false, open: async () => socket, progress: async () => {}, generated })
  expect(socket.binaryType).toBe('arraybuffer')
  expect(generated).toHaveBeenCalledWith('https://audio.bytespeech.com/podcast.mp3')
})
test('上游报告截断时不保存音频地址', async () => {
  const { socket } = socketFixture(true)
  const generated = vi.fn(async () => {})
  await expect(generatePodcast({ settings: audioSettings, key: 'test-key', text: '正文', taskId: 'session', lastRound: -1, resume: false, open: async () => socket, progress: async () => {}, generated })).rejects.toThrow('截断')
  expect(generated).not.toHaveBeenCalled()
})
