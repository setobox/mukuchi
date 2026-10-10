import type { Fetch } from '../server/features/assistant/network'
import type { ModelEvent } from '../server/features/assistant/provider'
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { readTurnResponse } from '../app/features/assistant/transport'
import { callModel, modelBody } from '../server/features/assistant/provider'
import { assistantCredentialsSchema, defaultAssistantSettings } from '../shared/assistant/settings'
import { readSse } from '../shared/assistant/stream'

const settings = { ...defaultAssistantSettings, baseUrl: 'https://model.example.com/v1', model: 'fixture' }
const credentials = assistantCredentialsSchema.parse({ modelKey: 'fixture' })
const body = modelBody(settings, [{ role: 'user', content: '测试' }])
const encoder = new TextEncoder()
const intent = { blocks: [{ type: 'text', text: '中文“引号”与\\路径\n换行 😀', sourceIds: [] }], articles: [], references: [], taxonomy: null, suggestions: ['继续解释？'] }
const frame = (delta: unknown, finish: string | null = null) => `data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: finish }] })}\r\n\r\n`
function streaming() {
  let writer!: ReadableStreamDefaultController<Uint8Array>
  const cancel = vi.fn()
  const stream = new ReadableStream<Uint8Array>({ start(controller) {
    writer = controller
  }, cancel })
  return { writer, cancel, response: new Response(stream, { headers: { 'content-type': 'text/event-stream' } }) }
}
function response(text: string, split = 1) {
  const bytes = encoder.encode(text)
  return new Response(new ReadableStream<Uint8Array>({ start(controller) {
    for (let i = 0; i < bytes.length; i += split)
      controller.enqueue(bytes.slice(i, i + split))
    controller.close()
  } }), { headers: { 'content-type': 'text/event-stream' } })
}
const complete = () => response(`${frame({ content: JSON.stringify(intent) }, 'stop')}data: [DONE]\n\n`)
afterEach(() => vi.useRealTimers())

test('中文 UTF-8、转义和 JSON 字符跨网络包：首段在最终 JSON 到达前可见', async () => {
  const source = streaming()
  const events: ModelEvent[] = []
  const observed = Promise.withResolvers<void>()
  const task = callModel(settings, credentials, body, new AbortController().signal, async () => source.response, (event) => {
    events.push(event)
    if (event.type === 'text')
      observed.resolve()
  })
  const json = JSON.stringify(intent)
  const cut = json.indexOf('引号') + 1
  const bytes = encoder.encode(frame({ content: json.slice(0, cut) }))
  for (const byte of bytes)
    source.writer.enqueue(Uint8Array.of(byte))
  await observed.promise
  expect(events.some(event => event.type === 'block')).toBe(false)
  source.writer.enqueue(encoder.encode(`${frame({ content: json.slice(cut) }, 'stop')}data: [DONE]\n\n`))
  const result = await task
  expect(result).toMatchObject({ kind: 'final', intent })
  expect(events.flatMap(event => event.type === 'text' ? [event.text] : []).join('')).toBe(intent.blocks[0]!.text)
  expect(events.filter(event => event.type === 'block')).toHaveLength(1)
  expect(source.cancel).toHaveBeenCalledOnce()
})

test('工具名称和参数分片完成后才返回可执行调用', async () => {
  const chunks = [
    frame({ tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'search_', arguments: '{"query":"' } }] }),
    frame({ tool_calls: [{ index: 0, function: { name: 'articles', arguments: '中文","limit":3}' } }] }, 'tool_calls'),
    'data: [DONE]\n\n',
  ]
  const observe = vi.fn()
  const result = await callModel(settings, credentials, body, new AbortController().signal, async () => response(chunks.join(''), 3), observe)
  expect(result).toMatchObject({ kind: 'tools', calls: [{ id: 'call_1', function: { name: 'search_articles', arguments: '{"query":"中文","limit":3}' } }] })
  expect(observe.mock.calls.every(([event]) => event.type === 'stream')).toBe(true)
})

test('兼容接口把 type 放到 text 后：正文仍在块结束前流出且不重复', async () => {
  const source = streaming()
  const events: ModelEvent[] = []
  const observed = Promise.withResolvers<void>()
  const task = callModel(settings, credentials, body, new AbortController().signal, async () => source.response, (event) => {
    events.push(event)
    if (event.type === 'text')
      observed.resolve()
  })
  source.writer.enqueue(encoder.encode(frame({ content: '{"blocks":[{"sourceIds":[],"text":"先看到中文' })))
  await observed.promise
  expect(events.filter(event => event.type === 'block')).toHaveLength(0)
  expect(events.filter(event => event.type === 'text')).toEqual([{ type: 'text', index: 0, text: '先看到中文' }])
  source.writer.enqueue(encoder.encode(`${frame({ content: '，再确定类型","type":"text"}],"articles":[],"references":[],"taxonomy":null,"suggestions":[]}' }, 'stop')}data: [DONE]\n\n`))
  await expect(task).resolves.toMatchObject({ kind: 'final', intent: { blocks: [{ type: 'text', text: '先看到中文，再确定类型' }] } })
  expect(events.flatMap(event => event.type === 'text' ? event.text : []).join('')).toBe('先看到中文，再确定类型')
  expect(events.filter(event => event.type === 'block')).toHaveLength(1)
})

test.each([false, true])('超时诊断区分是否已收到 HTTP 响应头：%s', async (headers) => {
  vi.useFakeTimers()
  const source = streaming()
  const fetcher: Fetch = headers ? async () => source.response : async (_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true }))
  const task = callModel(settings, credentials, body, new AbortController().signal, fetcher, () => {})
  const failure = expect(task).rejects.toMatchObject({ code: 'upstream_timeout', adminMessage: expect.stringContaining(headers ? '已解析 1 个流式事件' : '未返回 HTTP 响应头') })
  if (headers)
    source.writer.enqueue(encoder.encode(frame({ role: 'assistant' })))
  await vi.advanceTimersByTimeAsync(60_000)
  await failure
})

test('结构生成先通知占位，完整块校验后才发送 HTML', async () => {
  const source = streaming()
  const events: ModelEvent[] = []
  const observed = Promise.withResolvers<void>()
  const task = callModel(settings, credentials, body, new AbortController().signal, async () => source.response, (event) => {
    events.push(event)
    if (event.type === 'structure')
      observed.resolve()
  })
  source.writer.enqueue(encoder.encode(frame({ content: '{"blocks":[{"type":"html",' })))
  await observed.promise
  expect(events.some(event => event.type === 'block')).toBe(false)
  source.writer.enqueue(encoder.encode(`${frame({ content: '"title":"布局","summary":"说明","sourceIds":[],"html":"<p>内容</p>","css":""}],"articles":[],"references":[],"taxonomy":null,"suggestions":[]}' }, 'stop')}data: [DONE]\n\n`))
  await expect(task).resolves.toMatchObject({ kind: 'final' })
  expect(events.filter(event => event.type === 'block')).toHaveLength(1)
})

test('最终 JSON 的 Unicode 与引号转义跨模型增量时不丢字符', async () => {
  const expected = { ...intent, blocks: [{ type: 'text', text: '中"文😀', sourceIds: [] }] }
  const json = JSON.stringify(expected).replace('中', '\\u4e2d').replace('😀', '\\ud83d\\ude00')
  const chunks = `${[...json].map(content => frame({ content })).join('') + frame({}, 'stop')}data: [DONE]\n\n`
  const events: ModelEvent[] = []
  const result = await callModel(settings, credentials, body, new AbortController().signal, async () => response(chunks, 5), (event) => {
    events.push(event)
  })
  expect(result).toMatchObject({ kind: 'final', intent: expected })
  expect(events.flatMap(event => event.type === 'text' ? event.text : []).join('')).toBe(expected.blocks[0]!.text)
})

test('缺少终止帧、无效 JSON 和无效块都不能写入完成历史', async () => {
  for (const text of [frame({ content: JSON.stringify(intent) }, 'stop'), `${frame({ content: '{"blocks":[{"type":"unknown"}]}' }, 'stop')}data: [DONE]\n\n`, 'data: invalid\n\n']) {
    const fetcher = vi.fn<Fetch>(async () => response(text, 4))
    await expect(callModel(settings, credentials, body, new AbortController().signal, fetcher, () => {})).rejects.toMatchObject({ code: 'invalid_model_response' })
    expect(fetcher).toHaveBeenCalledOnce()
  }
})

test('429 和网络失败仅在正文之前最多重试两次，按 1 秒与 2 秒退避', async () => {
  vi.useFakeTimers()
  const fetcher = vi.fn<Fetch>().mockResolvedValueOnce(Response.json({}, { status: 429 })).mockRejectedValueOnce(new TypeError('network')).mockImplementationOnce(async () => complete())
  const events: ModelEvent[] = []
  const task = callModel(settings, credentials, body, new AbortController().signal, fetcher, (event) => {
    events.push(event)
  })
  await vi.advanceTimersByTimeAsync(999)
  expect(fetcher).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(1)
  expect(fetcher).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(2000)
  await expect(task).resolves.toMatchObject({ kind: 'final' })
  expect(events.filter(event => event.type === 'retry')).toEqual([{ type: 'retry', attempt: 1 }, { type: 'retry', attempt: 2 }])
})

test('正文之后的网络故障不重放模型调用', async () => {
  const source = streaming()
  const fetcher = vi.fn<Fetch>(async () => source.response)
  const observed = Promise.withResolvers<void>()
  const task = callModel(settings, credentials, body, new AbortController().signal, fetcher, (event) => {
    if (event.type === 'text')
      observed.resolve()
  })
  const failure = expect(task).rejects.toMatchObject({ code: 'upstream_unavailable' })
  source.writer.enqueue(encoder.encode(frame({ content: '{"blocks":[{"type":"text","text":"已看到' })))
  await observed.promise
  source.writer.error(new TypeError('connection lost'))
  await failure
  expect(fetcher).toHaveBeenCalledOnce()
})

test.each(['abort', 'timeout'] as const)('%s 取消 reader 且停止后没有迟到增量', async (mode) => {
  vi.useFakeTimers()
  const source = streaming()
  const controller = new AbortController()
  const events: ModelEvent[] = []
  const task = callModel(settings, credentials, body, controller.signal, async () => source.response, (event) => {
    events.push(event)
  })
  const failure = expect(task).rejects.toMatchObject({ code: mode === 'abort' ? 'request_stopped' : 'upstream_timeout' })
  await vi.advanceTimersByTimeAsync(0)
  if (mode === 'abort')
    controller.abort()
  else await vi.advanceTimersByTimeAsync(60_000)
  await failure
  expect(source.cancel).toHaveBeenCalledOnce()
  expect(events).toEqual([])
  expect(() => source.writer.enqueue(encoder.encode(frame({ content: '迟到' })))).toThrow()
})

test('SSE 消费者校验请求、序号和完成帧，普通 JSON 保持兼容', async () => {
  const id = crypto.randomUUID()
  const rejected = { kind: 'rejected', code: 'fixture', message: 'fixture' }
  const event = (sequence: number, payload: unknown, requestId = id) => `data: ${JSON.stringify({ requestId, sequence, payload })}\n\n`
  const text = { type: 'text_delta', index: 0, text: '首段' }
  const received = vi.fn()
  await expect(readTurnResponse(response(event(0, text) + event(1, { type: 'result', response: rejected })), id, received)).resolves.toEqual(rejected)
  expect(received).toHaveBeenCalledWith(text)
  for (const invalid of [event(1, text), event(0, text, crypto.randomUUID()), event(0, text)])
    await expect(readTurnResponse(response(invalid), id, () => {})).rejects.toThrow()
  await expect(readTurnResponse(Response.json(rejected), id, received)).resolves.toEqual(rejected)
})

test('SSE 上限按字节计数，超限释放 reader', async () => {
  const source = streaming()
  source.writer.enqueue(encoder.encode('data: 中文\n\n'))
  const reader = readSse(source.response.body!, undefined, 10)
  await expect(reader.next()).rejects.toThrow('超过大小限制')
  expect(source.cancel).toHaveBeenCalledOnce()
})
