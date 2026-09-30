import type { Fetch } from '../server/features/assistant/network'
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { withTimeout } from '../server/features/assistant/network'
import { callModel, modelBody } from '../server/features/assistant/provider'
import { AssistantError, assistantLimits } from '../shared/assistant/model'
import { assistantCredentialsSchema, defaultAssistantSettings } from '../shared/assistant/settings'

const settings = { ...defaultAssistantSettings, baseUrl: 'https://model.example.com/v1', model: 'fixture' }
const credentials = assistantCredentialsSchema.parse({ modelKey: 'test-key' })
const body = modelBody(settings, [{ role: 'user', content: '介绍博客' }])
const response = () => Response.json({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: '{"text":"个人技术博客。","articles":[],"references":[],"taxonomy":null}' } }] })

afterEach(() => vi.useRealTimers())

test('模型响应超过旧 20 秒阈值仍能成功，只发出一次请求', async () => {
  vi.useFakeTimers()
  const fetcher = vi.fn<Fetch>((_url, init) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(response()), 35_000)
    init?.signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(init.signal?.reason)
    }, { once: true })
  }))
  const result = callModel(settings, credentials, body, new AbortController().signal, fetcher)
  const checked = expect(result).resolves.toMatchObject({ kind: 'final', intent: { text: '个人技术博客。' } })
  await vi.advanceTimersByTimeAsync(35_000)
  await checked
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(vi.getTimerCount()).toBe(0)
})

test.each(['headers', 'body'])('模型等待 %s 达到 60 秒时明确报告超时，读取响应体不会掩盖原因', async (phase) => {
  vi.useFakeTimers()
  const fetcher = vi.fn<Fetch>(async (_url, init) => {
    const signal = init!.signal!
    if (phase === 'headers')
      return new Promise<Response>((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
    return new Response(new ReadableStream({ start(controller) {
      signal.addEventListener('abort', () => controller.error(signal.reason), { once: true })
    } }))
  })
  const checked = expect(callModel(settings, credentials, body, new AbortController().signal, fetcher)).rejects.toMatchObject({ statusCode: 504, code: 'upstream_timeout', message: '模型请求超过 60 秒未完成，请稍后重试' })
  await vi.advanceTimersByTimeAsync(assistantLimits.modelMs)
  await checked
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(vi.getTimerCount()).toBe(0)
})

test('总时限与主动停止保留各自原因，取消后不再发起请求', async () => {
  const parent = new AbortController()
  parent.abort(new AssistantError(504, 'turn_timeout', '能力测试超过 180 秒，请稍后重试'))
  const fetcher = vi.fn<Fetch>()
  await expect(callModel(settings, credentials, body, parent.signal, fetcher)).rejects.toMatchObject({ statusCode: 504, code: 'turn_timeout' })
  expect(fetcher).not.toHaveBeenCalled()
  const cancelled = new AbortController()
  cancelled.abort()
  await expect(withTimeout(cancelled.signal, 1000, async () => true)).rejects.toMatchObject({ code: 'request_stopped', message: '本次处理已停止' })
})
