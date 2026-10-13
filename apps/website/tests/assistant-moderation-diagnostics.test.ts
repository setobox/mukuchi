import type { ModelLogRecord } from '../server/features/assistant/diagnostics'
import type { Fetch } from '../server/features/assistant/network'
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { moderate } from '../server/features/assistant/moderation'
import { assistantLimits } from '../shared/assistant/model'
import { assistantCredentialsSchema, defaultAssistantSettings } from '../shared/assistant/settings'

const credentials = assistantCredentialsSchema.parse({ modelKey: 'PRIVATE_MODEL_KEY', aliyunKeyId: 'PRIVATE_AK_ID', aliyunKeySecret: 'PRIVATE_AK_SECRET', turnstileSecret: 'PRIVATE_TURNSTILE' })
const requestId = '12345678-1234-4123-8123-123456789012'
const clear = { Code: 200, Data: { Suggestion: 'pass', Detail: [{ Type: 'contentModeration', Suggestion: 'pass' }, { Type: 'promptAttack', Suggestion: 'pass' }] } }

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

test('审核记录签名、响应和完成阶段，关联任务但不记录输入或请求头', async () => {
  const logs: ModelLogRecord[] = []
  await expect(moderate('PRIVATE_INPUT', 'input', defaultAssistantSettings, credentials, new AbortController().signal, async () => Response.json(clear), { requestId, source: 'capability_test', log: entry => logs.push(entry) })).resolves.toBe(true)
  expect(logs.map(entry => entry.event)).toEqual(['request', 'signed', 'response', 'completed'])
  expect(new Set(logs.map(entry => entry.callId)).size).toBe(1)
  expect(logs.every(entry => entry.requestId === requestId && entry.source === 'capability_test')).toBe(true)
  expect(logs[0]?.details).toMatchObject({ endpoint: 'https://green-cip.cn-shanghai.aliyuncs.com/', service: 'query_security_check_pro', direction: 'input' })
  expect(JSON.stringify(logs)).not.toContain('PRIVATE_')
})

test('网络原始异常和 cause 在 503 转换前保留，正文、凭据和签名脱敏', async () => {
  const logs: ModelLogRecord[] = []
  const input = 'PRIVATE_INPUT 中文\n"正文"'
  let authorization = ''
  const cause = Object.assign(new Error('TLS connection reset'), { code: 'ECONNRESET' })
  Object.assign(cause, { cause }) // Cyclic causes must terminate.
  const fetcher = vi.fn<Fetch>(async (_url, init) => {
    authorization = new Headers(init?.headers).get('authorization')!
    throw new TypeError(`fetch failed ${Object.values(credentials).join(' ')} ${input} ${encodeURIComponent(input)} ${JSON.stringify(input)} ${init?.body} ${authorization}`, { cause })
  })
  const error: unknown = await moderate(input, 'input', defaultAssistantSettings, credentials, new AbortController().signal, fetcher, { requestId, log: entry => logs.push(entry) }).catch(error => error)
  expect(error).toMatchObject({ code: 'upstream_unavailable', statusCode: 503, message: '服务暂不可用，请稍后重试' })
  expect(JSON.stringify(error)).not.toContain('fetch failed')
  expect(logs.at(-1)).toMatchObject({ event: 'failed', details: { phase: 'waiting_headers', receivedHeaders: false, upstreamStatus: null, originalError: [{ name: 'TypeError', message: expect.stringContaining('fetch failed') }, { code: 'ECONNRESET', message: 'TLS connection reset' }] } })
  const output = JSON.stringify(logs)
  expect(output).not.toContain('PRIVATE_')
  expect(output).not.toContain(authorization.split('Signature=')[1])
  expect(output).toContain('[REDACTED]')
  expect(fetcher).toHaveBeenCalledTimes(1)
})

test('签名异常标记 signing，且不发送请求', async () => {
  vi.spyOn(crypto.subtle, 'sign').mockRejectedValueOnce(new DOMException('Signing unavailable', 'OperationError'))
  const logs: ModelLogRecord[] = []
  const fetcher = vi.fn<Fetch>()
  await expect(moderate('test', 'input', defaultAssistantSettings, credentials, new AbortController().signal, fetcher, { log: entry => logs.push(entry) })).rejects.toMatchObject({ code: 'upstream_unavailable' })
  expect(logs.at(-1)).toMatchObject({ event: 'failed', details: { phase: 'signing', receivedHeaders: false, originalError: [{ name: 'OperationError', message: 'Signing unavailable' }] } })
  expect(fetcher).not.toHaveBeenCalled()
})

test('响应流中断保留原始异常，能与请求未到达区分', async () => {
  const logs: ModelLogRecord[] = []
  const fetcher: Fetch = async () => new Response(new ReadableStream({ start(controller) {
    controller.error(new Error('upstream body disconnected'))
  } }))
  await expect(moderate('test', 'input', defaultAssistantSettings, credentials, new AbortController().signal, fetcher, { log: entry => logs.push(entry) })).rejects.toMatchObject({ code: 'invalid_response' })
  expect(logs.at(-1)).toMatchObject({ event: 'failed', details: { phase: 'reading_body', receivedHeaders: true, upstreamStatus: 200, originalError: [{ message: 'upstream body disconnected' }] } })
})

test('阿里云错误保留 HTTP 状态和请求标识，不记录不受信任的错误正文', async () => {
  const logs: ModelLogRecord[] = []
  const fetcher: Fetch = async () => Response.json({ Code: 'NoPermission', RequestId: requestId, Message: 'PRIVATE_RESPONSE', Recommend: 'PRIVATE_RESPONSE' }, { status: 403 })
  await expect(moderate('test', 'input', defaultAssistantSettings, credentials, new AbortController().signal, fetcher, { log: entry => logs.push(entry) })).rejects.toMatchObject({ code: 'moderation_permission_denied' })
  expect(logs.at(-1)).toMatchObject({ event: 'failed', details: { receivedHeaders: true, upstreamStatus: 403, upstreamCode: 'NoPermission', upstreamRequestId: requestId } })
  expect(JSON.stringify(logs)).not.toContain('PRIVATE_RESPONSE')
})

test.each(['timeout', 'abort'])('%s 保留原始终止原因及原有状态码，清理计时器', async (mode) => {
  vi.useFakeTimers()
  const logs: ModelLogRecord[] = []
  const controller = new AbortController()
  const started = Promise.withResolvers<void>()
  const fetcher: Fetch = async (_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
    started.resolve()
  })
  const result = moderate('test', 'input', defaultAssistantSettings, credentials, controller.signal, fetcher, { log: entry => logs.push(entry) })
  const checked = expect(result).rejects.toMatchObject({ code: mode === 'timeout' ? 'upstream_timeout' : 'request_stopped', statusCode: mode === 'timeout' ? 504 : 503 })
  await started.promise
  if (mode === 'timeout')
    await vi.advanceTimersByTimeAsync(assistantLimits.moderationMs)
  else controller.abort(new Error('caller cancelled'))
  await checked
  expect(logs.at(-1)).toMatchObject({ event: 'failed', details: { phase: 'waiting_headers', receivedHeaders: false, originalError: [{ message: expect.any(String) }] } })
  expect(vi.getTimerCount()).toBe(0)
})

test('生产日志使用独立前缀，日志失败及非法 Unicode 不影响审核', async () => {
  vi.stubEnv('NODE_ENV', 'production')
  const sink = vi.spyOn(console, 'info').mockImplementation(() => {})
  await moderate('test', 'input', defaultAssistantSettings, credentials, new AbortController().signal, async () => Response.json(clear), { requestId })
  expect(sink).toHaveBeenCalledWith(expect.stringContaining('[assistant:moderation]'))
  await expect(moderate('\uD800', 'input', defaultAssistantSettings, credentials, new AbortController().signal, async () => Response.json(clear), { log: () => {
    throw new Error('sink unavailable')
  } })).resolves.toBe(true)
})
