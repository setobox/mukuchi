// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { createApp, nextTick, onBeforeUnmount, ref, useTemplateRef } from 'vue'
import AssistantChallenge from '../app/components/assistant/AssistantChallenge.vue'

const state = vi.hoisted(() => ({ load: vi.fn(async () => {}) }))
vi.mock('@vueuse/core', () => ({ useScriptTag: () => ({ load: state.load }) }))
const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  state.load.mockImplementation(async () => {})
})
async function setup() {
  for (const [key, value] of Object.entries({ ref, useTemplateRef, onBeforeUnmount })) vi.stubGlobal(key, value)
  const callbacks: Record<string, unknown>[] = []
  const execute = vi.fn()
  const remove = vi.fn()
  vi.stubGlobal('turnstile', { render: vi.fn((_element: HTMLElement, options: Record<string, unknown>) => {
    callbacks.push(options)
    return String(callbacks.length)
  }), execute, remove })
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp(AssistantChallenge, { siteKey: 'fixture' })
  const instance = app.mount(host) as unknown as { verify: () => Promise<string>, cancel: () => void }
  cleanups.push(() => {
    app.unmount()
    host.remove()
  })
  await nextTick()
  const callback = (index: number, name: string, token?: string) => (callbacks[index]![name] as (token?: string) => void)(token)
  return { instance, callbacks, callback, execute, remove, host }
}
test('提交时才加载并执行交互模式验证，重复提交被拒绝；人工验证按需显示并自动续发 token', async () => {
  const { instance, callbacks, callback, execute, host } = await setup()
  expect(state.load).not.toHaveBeenCalled()
  expect(host.textContent).toBe('')
  const pending = instance.verify()
  await expect(instance.verify()).rejects.toThrow('正在验证')
  await vi.waitFor(() => expect(execute).toHaveBeenCalledOnce())
  expect(callbacks[0]).toMatchObject({ appearance: 'interaction-only', execution: 'execute', action: 'assistant' })
  callback(0, 'before-interactive-callback')
  await nextTick()
  expect(host.textContent).toContain('请完成验证')
  callback(0, 'callback', 'token')
  await expect(pending).resolves.toBe('token')
  await nextTick()
  expect(host.textContent).toBe('')
})
test('取消后迟到脚本和旧 token 不会完成新请求；过期和失败允许重试', async () => {
  const { instance, callback, execute } = await setup()
  const loading = Promise.withResolvers<void>()
  state.load.mockImplementationOnce(() => loading.promise)
  const first = instance.verify()
  const rejected = expect(first).rejects.toThrow('取消')
  instance.cancel()
  const second = instance.verify()
  await vi.waitFor(() => expect(execute).toHaveBeenCalledOnce())
  loading.resolve()
  await rejected
  await nextTick()
  expect(execute).toHaveBeenCalledOnce()
  callback(0, 'expired-callback')
  await expect(second).rejects.toThrow('过期')
  const third = instance.verify()
  await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(2))
  callback(0, 'callback', 'stale-token')
  callback(1, 'callback', 'fresh-token')
  await expect(third).resolves.toBe('fresh-token')
  const fourth = instance.verify()
  await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(3))
  callback(2, 'error-callback')
  await expect(fourth).rejects.toThrow('暂不可用')
})
