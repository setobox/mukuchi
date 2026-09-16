// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { nextTick, ref } from 'vue'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.resetModules()
})

test('实际插件只采集成功页面，忽略参数变化并在缓存恢复时新增事件', async () => {
  const currentRoute = ref({ path: '/posts', fullPath: '/posts', matched: [{}] })
  const error = ref<object | null>({ statusCode: 404 })
  const hooks = new Map<string, () => void>()
  const app = { $router: { currentRoute }, hook: (name: string, callback: () => void) => hooks.set(name, callback) }
  const send = vi.fn().mockResolvedValue({ summary: { pageViews: 1, visitors: 1, startedAt: null }, page: { path: '/posts', pageViews: 1 } })
  let restore: EventListener | null = null
  vi.spyOn(window, 'addEventListener').mockImplementation((type, callback) => {
    if (type === 'pageshow' && typeof callback === 'function')
      restore = callback
  })
  vi.stubGlobal('defineNuxtPlugin', (initialize: (context: typeof app) => unknown) => initialize(app))
  vi.stubGlobal('useVisitStats', () => ({ enabled: true, endpoint: (path: string) => `/api/stats/${path}`, accept: vi.fn(), fail: vi.fn() }))
  vi.stubGlobal('useRuntimeConfig', () => ({ app: { baseURL: '/' } }))
  vi.stubGlobal('useError', () => error)
  vi.stubGlobal('nextTick', nextTick)
  vi.stubGlobal('$fetch', send)
  await import('../app/plugins/stats.client')
  hooks.get('app:mounted')?.()
  expect(send).not.toHaveBeenCalled()
  error.value = null
  hooks.get('page:loading:end')?.()
  await nextTick()
  expect(send).toHaveBeenCalledTimes(1)
  currentRoute.value.fullPath = '/posts?tag=Vue#section'
  hooks.get('page:loading:end')?.()
  await nextTick()
  expect(send).toHaveBeenCalledTimes(1)
  currentRoute.value.path = '/about'
  hooks.get('page:loading:end')?.()
  await nextTick()
  expect(send).toHaveBeenCalledTimes(2)
  const restorePage = (persisted: boolean) => {
    const event = new Event('pageshow')
    Object.defineProperty(event, 'persisted', { value: persisted })
    const handler = restore as EventListener | null
    handler?.(event)
  }
  restorePage(false)
  expect(send).toHaveBeenCalledTimes(2)
  restorePage(true)
  expect(send).toHaveBeenCalledTimes(3)
  const events = send.mock.calls.map(call => call[1].body.eventId)
  expect(new Set(events).size).toBe(3)
  hooks.get('app:error')?.()
  error.value = { statusCode: 500 }
  restorePage(true)
  expect(send).toHaveBeenCalledTimes(3)
})
