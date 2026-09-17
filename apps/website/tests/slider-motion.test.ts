// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { createApp, h, nextTick, ref } from 'vue'
import { useSliderMotion } from '../app/shared/slider-motion'

const calls = vi.hoisted(() => ({ to: vi.fn(), kill: vi.fn() }))
vi.mock('gsap', () => ({ gsap: { to: calls.to.mockImplementation(() => ({ kill: calls.kill })) } }))
const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup())
  vi.restoreAllMocks()
  vi.clearAllMocks()
})
async function mount(reduce = false) {
  vi.spyOn(window, 'matchMedia').mockImplementation(query => ({ matches: reduce, media: query, onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: () => true }))
  const host = document.createElement('div')
  document.body.append(host)
  let motion: ReturnType<typeof useSliderMotion> | undefined
  const track = ref<HTMLElement | null>(null)
  const app = createApp({ setup() {
    motion = useSliderMotion(track)
    return () => h('div', { ref: track })
  } })
  app.mount(host)
  await nextTick()
  const close = () => {
    app.unmount()
    host.remove()
  }
  cleanups.push(close)
  return { motion: motion!, track, close }
}
test('滑动越界仅伸展外观，回弹可中断并在卸载时清理', async () => {
  const { motion, track, close } = await mount()
  motion.stretch(1000, 0, 100)
  expect(track.value!.style.transform).toContain('scaleX(1.08)')
  await motion.release()
  expect(calls.to).toHaveBeenCalledOnce()
  motion.stretch(-100, 0, 100)
  expect(calls.kill).toHaveBeenCalled()
  expect(track.value!.style.transformOrigin).toBe('right')
  await motion.release()
  close()
  expect(calls.kill).toHaveBeenCalledTimes(2)
  cleanups.pop()
})
test('减少动态效果时不伸展也不播放回弹', async () => {
  const { motion, track } = await mount(true)
  motion.stretch(200, 0, 100)
  await motion.release()
  expect(track.value!.style.transform).toBe('')
  expect(calls.to).not.toHaveBeenCalled()
})
