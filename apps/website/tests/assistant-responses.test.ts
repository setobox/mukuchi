import type { ModelLogRecord } from '../server/features/assistant/diagnostics'
import type { Fetch } from '../server/features/assistant/network'
import type { ModelEvent } from '../server/features/assistant/provider'
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { callModel, modelBody } from '../server/features/assistant/provider'
import { assistantCredentialsSchema, defaultAssistantSettings } from '../shared/assistant/settings'

const settings = { ...defaultAssistantSettings, apiFormat: 'responses' as const, baseUrl: 'https://model.example.com/v1', model: 'gpt-6.1-sol' }
const credentials = assistantCredentialsSchema.parse({ modelKey: 'PRIVATE_KEY' })
const body = modelBody(settings, [{ role: 'user', content: '介绍本站' }])
const intent = { blocks: [{ type: 'text', text: '中文“引号”与换行\n😀', sourceIds: [] }], articles: [], references: [], taxonomy: null, suggestions: [] }
const reasoning = { type: 'reasoning' as const, id: 'rs_1', summary: [], encrypted_content: 'ENCRYPTED_REASONING' }
const tool = { type: 'function_call' as const, id: 'fc_1', call_id: 'call_1', name: 'get_site_info' as const, arguments: '{"scope":"site"}', status: 'completed' as const }
const message = (text = JSON.stringify(intent)) => ({ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text }] })
const completed = (output: unknown[]) => ({ type: 'response.completed', response: { status: 'completed', output, usage: { input_tokens: 42, output_tokens: 11 } } })
const frame = (event: unknown) => `data: ${JSON.stringify(event)}\n\n`
const encoder = new TextEncoder()
const response = (...events: unknown[]) => new Response(events.map(frame).join(''), { headers: { 'content-type': 'text/event-stream' } })

afterEach(() => vi.useRealTimers())

test('Responses 使用独立请求协议，工具与加密推理项目随工具结果回传', async () => {
  const fetcher = vi.fn<Fetch>(async () => response(completed([reasoning, tool])))
  const first = await callModel(settings, credentials, modelBody(settings, [{ role: 'user', content: '介绍本站' }], 'required'), new AbortController().signal, fetcher)
  expect(first).toMatchObject({ kind: 'tools', calls: [{ id: 'call_1', function: { name: 'get_site_info' } }], responseItems: [reasoning, tool], usage: { prompt_tokens: 42, completion_tokens: 11 } })
  expect(fetcher.mock.calls[0]?.[0]).toBe('https://model.example.com/v1/responses')
  expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ redirect: 'manual', headers: { authorization: 'Bearer PRIVATE_KEY' } })
  const request = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))
  expect(request).toMatchObject({
    model: 'gpt-6.1-sol',
    stream: true,
    store: false,
    include: ['reasoning.encrypted_content'],
    max_output_tokens: 4096,
    tool_choice: 'required',
    parallel_tool_calls: false,
    input: [{ role: 'user', content: '介绍本站' }],
    text: { format: { type: 'json_schema', name: 'blog_assistant_answer', strict: true } },
  })
  expect(request.instructions).toContain('text.format')
  expect(request.instructions).toContain('function_call')
  expect(request.tools[0]).toMatchObject({ type: 'function', name: 'get_site_info', strict: true })
  for (const key of ['messages', 'response_format', 'max_tokens'])
    expect(request).not.toHaveProperty(key)
  expect(request.tools[0]).not.toHaveProperty('function')
  if (first.kind !== 'tools')
    throw new Error('Expected tools')
  const next = modelBody(settings, [
    { role: 'user', content: '介绍本站' },
    { role: 'assistant', content: null, tool_calls: first.calls, responseItems: first.responseItems },
    { role: 'tool', tool_call_id: 'call_1', content: '{"name":"Blog"}' },
  ])
  fetcher.mockImplementationOnce(async () => response(completed([message()])))
  await expect(callModel(settings, credentials, next, new AbortController().signal, fetcher)).resolves.toMatchObject({ kind: 'final', intent })
  expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body)).input).toEqual([
    { role: 'user', content: '介绍本站' },
    reasoning,
    tool,
    { type: 'function_call_output', call_id: 'call_1', output: '{"name":"Blog"}' },
  ])
})

test('Responses 正文增量立即显示，completed 快照不重复输出，无需 [DONE]', async () => {
  let writer!: ReadableStreamDefaultController<Uint8Array>
  const cancel = vi.fn()
  const source = new Response(new ReadableStream<Uint8Array>({ start(controller) {
    writer = controller
  }, cancel }), { headers: { 'content-type': 'text/event-stream' } })
  const events: ModelEvent[] = []
  const logs: ModelLogRecord[] = []
  const observed = Promise.withResolvers<void>()
  const task = callModel(settings, credentials, body, new AbortController().signal, async () => source, (event) => {
    events.push(event)
    if (event.type === 'text')
      observed.resolve()
  }, { log: entry => logs.push(entry) })
  const json = JSON.stringify(intent)
  const cut = json.indexOf('引号') + 1
  const delta = (text: string) => frame({ type: 'response.output_text.delta', output_index: 1, content_index: 0, delta: text })
  for (const byte of encoder.encode(frame({ type: 'response.created' }) + delta(json.slice(0, cut))))
    writer.enqueue(Uint8Array.of(byte))
  await observed.promise
  expect(events.some(event => event.type === 'block')).toBe(false)
  writer.enqueue(encoder.encode(delta(json.slice(cut)) + frame(completed([reasoning, message()]))))
  await expect(task).resolves.toMatchObject({ kind: 'final', intent })
  expect(events.flatMap(event => event.type === 'text' ? [event.text] : []).join('')).toBe(intent.blocks[0]!.text)
  expect(events.filter(event => event.type === 'block')).toHaveLength(1)
  expect(logs.at(-1)).toMatchObject({ event: 'completed', details: { done: true, receivedFrames: 4, usage: { prompt_tokens: 42, completion_tokens: 11 } } })
  expect(JSON.stringify(logs)).not.toContain('ENCRYPTED_REASONING')
  expect(cancel).toHaveBeenCalledOnce()
})

test('Responses 工具参数分片和 done 事件均不提前执行工具，等待 completed', async () => {
  let writer!: ReadableStreamDefaultController<Uint8Array>
  const source = new Response(new ReadableStream<Uint8Array>({ start(controller) {
    writer = controller
  } }), { headers: { 'content-type': 'text/event-stream' } })
  const events: ModelEvent[] = []
  const progressed = Promise.withResolvers<void>()
  let resolved = false
  const task = callModel(settings, credentials, body, new AbortController().signal, async () => source, (event) => {
    events.push(event)
    if (events.length === 4)
      progressed.resolve()
  }).then((result) => {
    resolved = true
    return result
  })
  writer.enqueue(encoder.encode([
    { type: 'response.output_item.added', output_index: 1, item: { ...tool, arguments: '', status: 'in_progress' } },
    { type: 'response.function_call_arguments.delta', output_index: 1, delta: '{"scope":' },
    { type: 'response.function_call_arguments.delta', output_index: 1, delta: '"site"}' },
    { type: 'response.output_item.done', output_index: 1, item: tool },
  ].map(frame).join('')))
  await progressed.promise
  expect(resolved).toBe(false)
  expect(events.every(event => event.type === 'stream')).toBe(true)
  writer.enqueue(encoder.encode(frame(completed([reasoning, tool]))))
  await expect(task).resolves.toMatchObject({ kind: 'tools', calls: [{ id: 'call_1', function: { arguments: '{"scope":"site"}' } }] })
})

test.each([
  [{ type: 'response.created' }],
  [{ type: 'response.failed', response: { error: { message: 'PRIVATE_ERROR' } } }],
  [{ type: 'error', message: 'PRIVATE_ERROR' }],
  [{ type: 'response.incomplete' }],
  [completed([{ ...tool, name: 'read_secret' }])],
  [completed([tool, { ...tool, id: 'fc_2' }])],
  [completed([{ ...tool, status: 'in_progress' }])],
  [completed([tool, message()])],
  [completed([])],
  [{ type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: JSON.stringify(intent) }, completed([message('{}')])],
])('Responses 错误、截断或不一致输出拒绝完成，不泄漏原始错误：%j', async (...events) => {
  const fetcher = vi.fn<Fetch>(async () => response(...events))
  const error: unknown = await callModel(settings, credentials, body, new AbortController().signal, fetcher, () => {}).catch(cause => cause)
  expect(error).toMatchObject({ code: 'invalid_model_response' })
  expect(JSON.stringify(error)).not.toContain('PRIVATE_ERROR')
  expect(fetcher).toHaveBeenCalledOnce()
})

test('Responses 拒绝事件与非流式拒绝均映射为 model_rejected', async () => {
  for (const reply of [response({ type: 'response.refusal.delta', delta: 'PRIVATE_REFUSAL' }), Response.json(completed([{ type: 'message', role: 'assistant', content: [{ type: 'refusal', refusal: 'PRIVATE_REFUSAL' }] }]).response)]) {
    const error: unknown = await callModel(settings, credentials, body, new AbortController().signal, async () => reply).catch(cause => cause)
    expect(error).toMatchObject({ code: 'model_rejected' })
    expect(JSON.stringify(error)).not.toContain('PRIVATE_REFUSAL')
  }
})

test('Responses 非流式快照可读取，但不伪造 stream 事件', async () => {
  const observe = vi.fn()
  await expect(callModel(settings, credentials, body, new AbortController().signal, async () => Response.json(completed([message()]).response), observe)).resolves.toMatchObject({ kind: 'final', intent })
  expect(observe).not.toHaveBeenCalled()
})

test.each(['timeout', 'abort'] as const)('Responses %s 取消上游 reader', async (mode) => {
  vi.useFakeTimers()
  const cancel = vi.fn()
  const source = new Response(new ReadableStream<Uint8Array>({ start(controller) {
    controller.enqueue(encoder.encode(frame({ type: 'response.created' })))
  }, cancel }), { headers: { 'content-type': 'text/event-stream' } })
  const controller = new AbortController()
  const task = callModel(settings, credentials, body, controller.signal, async () => source, () => {})
  const failure = expect(task).rejects.toMatchObject({ code: mode === 'abort' ? 'request_stopped' : 'upstream_timeout' })
  await vi.advanceTimersByTimeAsync(0)
  if (mode === 'abort')
    controller.abort()
  else await vi.advanceTimersByTimeAsync(60_000)
  await failure
  expect(cancel).toHaveBeenCalledOnce()
})
