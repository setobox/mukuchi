import type { H3Event } from 'h3'
import type { EngineDependencies } from '../server/features/assistant/engine'
import type { AssistantRepository } from '../server/features/assistant/repository'
import type { TurnResponse } from '../shared/assistant/model'
import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test'
import { turnsRoute } from '../server/features/assistant/service'
import { AssistantError } from '../shared/assistant/model'
import { readSse } from '../shared/assistant/stream'

const fixture = vi.hoisted(() => ({
  open: false,
  streaming: true,
  requestId: '11111111-1111-4111-8111-111111111111',
  finish: Promise.withResolvers<TurnResponse>(),
  deps: undefined as EngineDependencies | undefined,
  identity: vi.fn(async () => ({ actor: 'fixture', authenticated: true })),
  previewIdentity: vi.fn(async () => ({ actor: 'admin-preview:fixture', authenticated: true })),
  admitPreview: vi.fn(),
  clean: vi.fn(),
  admit: vi.fn(),
  end: vi.fn(),
}))
vi.mock('../server/features/assistant/http', () => ({
  assistantIdentity: fixture.identity,
  previewIdentity: fixture.previewIdentity,
  previewConfiguration: async () => ({ secret: 'fixture', version: 1, settings: {}, credentials: {} }),
  assistantJson: async () => ({ requestId: fixture.requestId, conversationId: '22222222-2222-4222-8222-222222222222', text: '问题', page: { path: null }, history: [] }),
  assistantConfiguration: async () => ({ secret: 'fixture', version: 1, settings: {}, credentials: {} }),
  trustedClientIp: () => '127.0.0.1',
  withAssistant: async (_event: H3Event, operation: (repository: AssistantRepository) => Promise<unknown>) => {
    fixture.open = true
    try {
      return await operation({ clean: fixture.clean, admit: fixture.admit, admitPreview: fixture.admitPreview, end: fixture.end } as unknown as AssistantRepository)
    }
    finally { fixture.open = false }
  },
}))
vi.mock('../server/features/assistant/crypto', () => ({ verifyHistory: async () => [], signValue: async () => 'fixture' }))
vi.mock('../server/features/assistant/content-source', () => ({ publicContent: () => ({}) }))
vi.mock('../server/features/assistant/engine', () => ({
  createAssistantEngine: (deps: EngineDependencies) => {
    fixture.deps = deps
    return {
      fingerprint: async () => 'fixture',
      start: async () => {
        await deps.emit?.(fixture.requestId, { type: 'status', label: 'Thinking…' })
        await deps.emit?.(fixture.requestId, { type: 'text_delta', index: 0, text: '首段' })
        deps.signal.throwIfAborted()
        return new Promise<TurnResponse>((resolve, reject) => {
          const abort = () => reject(deps.signal.reason)
          deps.signal.addEventListener('abort', abort, { once: true })
          void fixture.finish.promise.then(resolve, reject).finally(() => deps.signal.removeEventListener('abort', abort))
        })
      },
    }
  },
}))
let res: EventEmitter
let event: H3Event
beforeEach(() => {
  fixture.finish = Promise.withResolvers<TurnResponse>()
  fixture.streaming = true
  fixture.open = false
  res = new EventEmitter()
  event = { node: { res }, context: {} } as unknown as H3Event
  vi.stubGlobal('getHeader', (_event: H3Event, header: string) => header === 'accept' && fixture.streaming ? 'text/event-stream' : undefined)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

test('SSE 立即返回并保持数据库至终止事件，事件有请求 ID 和连续序号', async () => {
  const response = await turnsRoute(event)
  expect(response).toBeInstanceOf(Response)
  const stream = response as Response
  expect(stream.headers.get('content-type')).toContain('text/event-stream')
  const frames = readSse(stream.body!)
  const first = JSON.parse((await frames.next()).value!)
  expect(first).toMatchObject({ requestId: fixture.requestId, sequence: 0, payload: { type: 'status', label: 'Thinking…' } })
  expect(fixture.open).toBe(true)
  expect(JSON.parse((await frames.next()).value!)).toMatchObject({ sequence: 1, payload: { type: 'text_delta', text: '首段' } })
  fixture.finish.resolve({ kind: 'rejected', code: 'fixture', message: 'done' })
  expect(JSON.parse((await frames.next()).value!)).toMatchObject({ sequence: 2, payload: { type: 'result' } })
  expect((await frames.next()).done).toBe(true)
  expect(fixture.open).toBe(false)
  expect(res.listenerCount('close')).toBe(0)
  expect(fixture.identity).toHaveBeenCalledWith(event, true)
})

test('浏览器取消 reader 会立即中止引擎并释放数据库和断连监听', async () => {
  const response = await turnsRoute(event) as Response
  const reader = response.body!.getReader()
  await reader.read()
  await reader.cancel()
  expect(fixture.deps?.signal.aborted).toBe(true)
  expect(fixture.open).toBe(false)
  expect(res.listenerCount('close')).toBe(0)
  expect((await reader.read()).done).toBe(true)
})

test('模型失败发送终止错误，普通 JSON 请求保持原有响应', async () => {
  const response = await turnsRoute(event) as Response
  const output = response.text()
  fixture.finish.reject(new AssistantError(504, 'upstream_timeout', '模型请求超时'))
  expect(await output).toContain('upstream_timeout')
  expect(fixture.open).toBe(false)
  fixture.streaming = false
  fixture.finish = Promise.withResolvers<TurnResponse>()
  const ordinary = turnsRoute(event)
  fixture.finish.resolve({ kind: 'rejected', code: 'fixture', message: 'JSON' })
  await expect(ordinary).resolves.toEqual({ kind: 'rejected', code: 'fixture', message: 'JSON' })
  expect(fixture.open).toBe(false)
})

test('管理员测试先鉴权，使用独立身份和免配额入口；公网仍走普通审核及准入', async () => {
  fixture.previewIdentity.mockRejectedValueOnce(new AssistantError(403, 'forbidden', '仅管理员'))
  await expect(turnsRoute(event, false, true)).rejects.toMatchObject({ statusCode: 403 })
  expect(fixture.admitPreview).not.toHaveBeenCalled()
  const response = await turnsRoute(event, false, true) as Response
  const output = response.text()
  fixture.finish.resolve({ kind: 'rejected', code: 'fixture', message: 'done' })
  await output
  expect(fixture.identity).not.toHaveBeenCalled()
  expect(fixture.admit).not.toHaveBeenCalled()
  expect(fixture.admitPreview).toHaveBeenCalledWith(expect.objectContaining({ actor: 'admin-preview:fixture' }), expect.any(Number))
  expect(fixture.deps?.preview).toBe(true)
  expect(fixture.deps?.actor).toBe('admin-preview:fixture')
  fixture.finish = Promise.withResolvers<TurnResponse>()
  const ordinary = await turnsRoute(event) as Response
  const ordinaryOutput = ordinary.text()
  fixture.finish.resolve({ kind: 'rejected', code: 'fixture', message: 'done' })
  await ordinaryOutput
  expect(fixture.admit).toHaveBeenCalledOnce()
  expect(fixture.deps?.preview).toBe(false)
})
