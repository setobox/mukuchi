import type { ModelLogRecord } from '../server/features/assistant/diagnostics'
import type { Fetch } from '../server/features/assistant/network'
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { callModel, modelBody } from '../server/features/assistant/provider'
import { assistantLimits } from '../shared/assistant/model'
import { assistantCredentialsSchema, defaultAssistantSettings } from '../shared/assistant/settings'

const settings = { ...defaultAssistantSettings, baseUrl: 'https://model.example.com/v1', model: 'fixture' }
const credentials = assistantCredentialsSchema.parse({ modelKey: 'PRIVATE_MODEL_KEY', aliyunKeySecret: 'PRIVATE_REVIEW_KEY' })
const body = modelBody(settings, [{ role: 'user', content: 'PRIVATE_USER_CONTENT' }])
const requestId = '12345678-1234-4123-8123-123456789012'
const encoder = new TextEncoder()
function response() {
  const intent = { blocks: [{ type: 'text', text: 'PRIVATE_ANSWER', sourceIds: [] }], articles: [], references: [], taxonomy: null, suggestions: [] }
  return new Response(new ReadableStream({ start(controller) {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: JSON.stringify(intent) }, finish_reason: 'stop' }], usage: { prompt_tokens: 42, completion_tokens: 11 } })}\n\ndata: [DONE]\n\n`))
    controller.close()
  } }), { headers: { 'content-type': 'text/event-stream', 'x-request-id': 'upstream-123', 'set-cookie': 'PRIVATE_COOKIE' } })
}
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

test('模型调用日志关联请求与各阶段，记录参数摘要和用量而不泄漏正文或密钥', async () => {
  const logs: ModelLogRecord[] = []
  const result = await callModel(settings, credentials, body, new AbortController().signal, async () => response(), undefined, { requestId, source: 'conversation', log: entry => logs.push(entry) })
  expect(result.kind).toBe('final')
  expect(logs.map(entry => entry.event)).toEqual(['request', 'response', 'first_frame', 'first_text', 'stream_end', 'completed'])
  expect(new Set(logs.map(entry => entry.callId)).size).toBe(1)
  expect(logs.every(entry => entry.requestId === requestId && entry.source === 'conversation' && entry.attempt === 1)).toBe(true)
  expect(logs[0]?.details).toMatchObject({ endpoint: 'https://model.example.com/v1/chat/completions', model: 'fixture', stream: true, maxTokens: 4096, messages: [{ role: 'system' }, { role: 'user', chars: 20 }] })
  expect(logs[1]?.details).toMatchObject({ status: 200, headers: { 'x-request-id': 'upstream-123' } })
  expect(logs.at(-1)?.details).toMatchObject({ done: true, receivedFrames: 2, textChars: 14, blockTypes: ['text'], usage: { prompt_tokens: 42, completion_tokens: 11 } })
  const output = JSON.stringify(logs)
  for (const secret of ['PRIVATE_MODEL_KEY', 'PRIVATE_REVIEW_KEY', 'PRIVATE_USER_CONTENT', 'PRIVATE_ANSWER', 'PRIVATE_COOKIE'])
    expect(output).not.toContain(secret)
})

test.each(['admin_preview', 'capability_test', 'conversation'] as const)('%s 调试日志包含实际发送的完整请求，保留长输入和转义，凭据仍脱敏', async (source) => {
  // Development includes public-route debugging; production only includes the
  // two server-authorized administrator test entry points.
  vi.stubEnv('NODE_ENV', source === 'conversation' ? 'development' : 'production')
  const logs: ModelLogRecord[] = []
  const input = `${'长输入'.repeat(1000)}\n换行\t制表符 "引号" \\路径 ${credentials.modelKey}`
  const request = modelBody(settings, [
    { role: 'user', content: JSON.stringify({ question: input, history: ['历史内容'] }) },
    { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'search_articles', arguments: '{"query":"Vue"}' } }] },
    { role: 'tool', tool_call_id: 'call_1', content: '{"articles":[]}' },
  ])
  let sentBody = ''
  await callModel(settings, credentials, request, new AbortController().signal, async (_url, init) => {
    sentBody = String(init?.body)
    return response()
  }, undefined, { requestId, source, log: entry => logs.push(entry) })
  const payload = logs.find(entry => entry.event === 'request_body')
  expect(payload).toMatchObject({ requestId, source, attempt: 1 })
  expect(payload?.details).toEqual(JSON.parse(sentBody.replaceAll(credentials.modelKey, '[REDACTED]')))
  expect(JSON.stringify(payload)).not.toContain(credentials.modelKey)
  expect(JSON.stringify(payload)).toContain('历史内容')
})

test('生产普通对话仍只记录摘要', async () => {
  vi.stubEnv('NODE_ENV', 'production')
  const logs: ModelLogRecord[] = []
  await callModel(settings, credentials, body, new AbortController().signal, async () => response(), undefined, { source: 'conversation', log: entry => logs.push(entry) })
  expect(logs.some(entry => entry.event === 'request_body')).toBe(false)
  expect(JSON.stringify(logs)).not.toContain('PRIVATE_USER_CONTENT')
})

test('收到两个 SSE 事件后正文解析失败时，日志保留分类诊断且不泄漏正文', async () => {
  const logs: ModelLogRecord[] = []
  const chunks = [{ role: 'assistant' }, { content: 'PRIVATE_ANSWER PRIVATE_MODEL_KEY' }]
  const fetcher = async () => new Response(chunks.map(delta => `data: ${JSON.stringify({ choices: [{ index: 0, delta }] })}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })
  await expect(callModel(settings, credentials, body, new AbortController().signal, fetcher, undefined, { requestId, source: 'capability_test', log: entry => logs.push(entry) })).rejects.toMatchObject({ code: 'invalid_model_response' })
  expect(logs.at(-1)?.details).toMatchObject({
    phase: 'reading_stream',
    receivedFrames: 2,
    textChars: 0,
    retry: false,
    error: [{ name: 'ModelContentError', diagnostic: expect.stringContaining('未以 JSON 对象开头') }],
  })
  expect(JSON.stringify(logs)).not.toContain('PRIVATE_ANSWER')
  expect(JSON.stringify(logs)).not.toContain('PRIVATE_MODEL_KEY')
})

test('底层错误码在异常映射前保留，重试沿用 callId 且增加 attempt', async () => {
  vi.useFakeTimers()
  const logs: ModelLogRecord[] = []
  const fetcher = vi.fn<Fetch>()
    .mockRejectedValueOnce(new TypeError('PRIVATE_USER_CONTENT PRIVATE_MODEL_KEY', { cause: Object.assign(new Error('PRIVATE_MODEL_KEY'), { code: 'UND_ERR_SOCKET' }) }))
    .mockResolvedValueOnce(response())
  const result = callModel(settings, credentials, body, new AbortController().signal, fetcher, () => {}, { requestId, log: entry => logs.push(entry) })
  await vi.advanceTimersByTimeAsync(1000)
  await expect(result).resolves.toMatchObject({ kind: 'final' })
  expect(logs.find(entry => entry.event === 'failed')?.details).toMatchObject({ phase: 'waiting_headers', receivedHeaders: false, retry: true, transportError: [{ name: 'TypeError' }, { code: 'UND_ERR_SOCKET' }] })
  expect(logs.filter(entry => entry.event === 'request').map(entry => entry.attempt)).toEqual([1, 2])
  expect(new Set(logs.map(entry => entry.callId)).size).toBe(1)
  expect(JSON.stringify(logs)).not.toContain('PRIVATE_')
  expect(vi.getTimerCount()).toBe(0)
})

test.each(['timeout', 'abort'])('%s 记录等待阶段并清理心跳，结束后无迟到日志', async (mode) => {
  vi.useFakeTimers()
  const logs: ModelLogRecord[] = []
  const controller = new AbortController()
  const fetcher: Fetch = async (_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true }))
  const result = callModel(settings, credentials, body, controller.signal, fetcher, undefined, { log: entry => logs.push(entry) })
  const checked = expect(result).rejects.toMatchObject({ code: mode === 'timeout' ? 'upstream_timeout' : 'request_stopped' })
  await vi.advanceTimersByTimeAsync(10_000)
  expect(logs.at(-1)).toMatchObject({ event: 'progress', details: { phase: 'waiting_headers', attemptMs: 10_000 } })
  if (mode === 'abort')
    controller.abort()
  else await vi.advanceTimersByTimeAsync(assistantLimits.modelMs - 10_000)
  await checked
  expect(logs.at(-1)).toMatchObject({ event: 'failed', details: { retry: false } })
  const count = logs.length
  await vi.advanceTimersByTimeAsync(20_000)
  expect(logs).toHaveLength(count)
  expect(vi.getTimerCount()).toBe(0)
})

test('供应商响应头中的已知凭据会脱敏，日志写入失败不影响回复', async () => {
  const logs: ModelLogRecord[] = []
  const fetcher = async () => {
    const value = response()
    value.headers.set('x-request-id', credentials.modelKey)
    return value
  }
  await callModel(settings, credentials, body, new AbortController().signal, fetcher, undefined, { log: entry => logs.push(entry) })
  expect(logs.find(entry => entry.event === 'response')?.details).toMatchObject({ headers: { 'x-request-id': '[REDACTED]' } })
  await expect(callModel(settings, credentials, body, new AbortController().signal, fetcher, undefined, { log: () => {
    throw new Error('sink unavailable')
  } })).resolves.toMatchObject({ kind: 'final' })
})
