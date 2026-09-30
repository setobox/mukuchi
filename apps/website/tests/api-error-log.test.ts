import type { H3Event } from 'h3'
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test'
import { defineAdminHandler } from '../server/features/admin/http'
import { defineAssistantHandler } from '../server/features/assistant/http'
import { defineAuthHandler } from '../server/features/auth/http'
import { logApiError, startApiErrorLog } from '../server/features/logging/api-error'
import { defineStatsHandler } from '../server/features/stats/handler'
import { AssistantError } from '../shared/assistant/model'

let baseURL = '/'
let now = 100
const output = vi.fn()

function request(path = '/api/assistant/turns'): H3Event {
  return { method: 'POST', path, context: {}, node: { res: { statusCode: 200 } } } as H3Event
}

beforeEach(() => {
  baseURL = '/'
  now = 100
  output.mockClear()
  vi.spyOn(console, 'error').mockImplementation(output)
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.stubGlobal('getRequestURL', (event: H3Event) => new URL(event.path, 'http://localhost:3333'))
  vi.stubGlobal('useRuntimeConfig', () => ({ app: { baseURL }, adminEnabled: true, public: { authEnabled: true } }))
  vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
  vi.stubGlobal('setResponseHeader', vi.fn())
  vi.stubGlobal('setResponseStatus', (event: H3Event, status: number) => {
    event.node.res.statusCode = status
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.resetModules()
})

test('失败请求输出方法、路径、状态、耗时及原始错误，保留堆栈和 cause', () => {
  const event = request('/api/assistant/turns?token=private-token')
  const error = new Error('provider failed', { cause: new Error('connection refused') })
  startApiErrorLog(event)
  expect(output).not.toHaveBeenCalled()
  now = 112.5
  logApiError(event, error, 503)
  expect(output).toHaveBeenCalledExactlyOnceWith('[API] POST /api/assistant/turns 503 (12.5ms)', {
    method: 'POST',
    path: '/api/assistant/turns',
    statusCode: 503,
    durationMs: 12.5,
  }, error)
  expect(JSON.stringify(output.mock.calls)).not.toContain('private-token')
})

test('处理器、Nitro error 和响应钩子对同一请求只记录一次，其他请求独立记录', () => {
  const event = request()
  startApiErrorLog(event)
  const error = new Error('failure')
  logApiError(event, error, 503)
  startApiErrorLog(event)
  logApiError(event, error, 503)
  logApiError(event, undefined, 503)
  expect(output).toHaveBeenCalledTimes(1)
  const other = request()
  startApiErrorLog(other)
  logApiError(other, error, 503)
  expect(output).toHaveBeenCalledTimes(2)
})

test('未启用开发日志的请求不记录，也不访问请求元数据', () => {
  logApiError(request(), new Error('failure'), 500)
  expect(output).not.toHaveBeenCalled()
  expect(vi.mocked(performance.now)).not.toHaveBeenCalled()
})

test('适配站点 baseURL，只记录 API，不记录页面或静态资源', () => {
  baseURL = '/blog/'
  for (const path of ['/blog/posts', '/blog/_nuxt/app.js', '/blog/apiculture', '/api/example']) {
    const event = request(path)
    startApiErrorLog(event)
    logApiError(event, undefined, 404)
  }
  expect(output).not.toHaveBeenCalled()
  const event = request('/blog/api/missing')
  startApiErrorLog(event)
  logApiError(event, undefined, 404)
  expect(output).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('/blog/api/missing 404'), expect.objectContaining({ statusCode: 404 }), '接口返回错误状态')
})

test.each([
  ['admin', defineAdminHandler],
  ['auth', defineAuthHandler],
  ['assistant', defineAssistantHandler],
  ['stats', defineStatsHandler],
] as const)('%s 处理器捕获的错误仍记录原始异常，公开响应保持脱敏', async (name, defineHandler) => {
  const event = request(`/api/${name}/example`)
  startApiErrorLog(event)
  const error = new Error('private provider detail')
  const handler = defineHandler(() => {
    throw error
  })
  const response = await handler(event)
  expect(event.node.res.statusCode).toBe(503)
  expect(JSON.stringify(response)).not.toContain('private provider detail')
  expect(output).toHaveBeenCalledWith(expect.stringContaining(`[API] POST /api/${name}/example 503`), expect.objectContaining({ statusCode: 503 }), error)
})

test('已处理的 4xx 也记录，成功请求保持安静', async () => {
  const event = request()
  startApiErrorLog(event)
  expect(await defineAssistantHandler(() => ({ ok: true }))(event)).toEqual({ ok: true })
  expect(output).not.toHaveBeenCalled()
  const error = new AssistantError(403, 'invalid_session', '会话已失效')
  await defineAssistantHandler(() => {
    throw error
  })(event)
  expect(output).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('403'), expect.objectContaining({ statusCode: 403 }), error)
})

test('非 Nuxt 开发环境不注册日志钩子', async () => {
  const hook = vi.fn()
  vi.stubGlobal('defineNitroPlugin', (plugin: (app: { hooks: { hook: typeof hook } }) => void) => plugin({ hooks: { hook } }))
  await import('../server/plugins/api-error-log')
  expect(hook).not.toHaveBeenCalled()
})
