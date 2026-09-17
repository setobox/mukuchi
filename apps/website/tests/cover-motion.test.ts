// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { createApp, h, nextTick, ref } from 'vue'
import { useCoverMotion } from '../app/features/cover/motion'

const calls = vi.hoisted(() => ({ fromTo: vi.fn(), killTweensOf: vi.fn(), set: vi.fn(), revert: vi.fn(), context: vi.fn() }))
vi.mock('gsap', () => ({ gsap: { ...calls, context: () => {
  calls.context()
  return { add: (fn: () => void) => fn(), revert: calls.revert }
} } }))
afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

async function mount(reduce: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(query => ({ matches: reduce, media: query, onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: () => true }))
  const host = document.createElement('div')
  document.body.append(host)
  let motion: ReturnType<typeof useCoverMotion> | undefined
  const app = createApp({ setup() {
    const root = ref<HTMLElement | null>(null)
    motion = useCoverMotion(root)
    return () => h('div', { ref: root }, [h('div', { 'data-cover-motion': 'panel' })])
  } })
  const previous = calls.context.mock.calls.length
  app.mount(host)
  await nextTick()
  await vi.waitFor(() => expect(calls.context).toHaveBeenCalledTimes(previous + 1))
  return { play: () => motion!.play('panel'), close: () => {
    app.unmount()
    host.remove()
  } }
}

test('减少动态效果时直接显示，正常模式切换可中断且离开时清理', async () => {
  const reduced = await mount(true)
  reduced.play()
  expect(calls.fromTo).not.toHaveBeenCalled()
  reduced.close()
  const normal = await mount(false)
  normal.play()
  normal.play()
  expect(calls.fromTo).toHaveBeenCalledTimes(2)
  expect(calls.killTweensOf).toHaveBeenCalledTimes(2)
  normal.close()
  expect(calls.revert).toHaveBeenCalledTimes(2)
})
