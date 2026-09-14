import { usePreferredReducedMotion, useWindowScroll } from '@vueuse/core'
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test'
import { computed, ref } from 'vue'
import { useScrollToTop } from '../app/composables/useScrollToTop.ts'

vi.mock('@vueuse/core', () => ({
  usePreferredReducedMotion: vi.fn(),
  useWindowScroll: vi.fn(),
}))

const y = ref(0)
const preferredMotion = ref<'reduce' | 'no-preference'>('no-preference')
beforeEach(() => {
  y.value = 0
  preferredMotion.value = 'no-preference'
  vi.mocked(useWindowScroll, { partial: true }).mockReturnValue({
    y: computed({
      get: () => y.value,
      set: (value) => {
        y.value = value
      },
    }),
  })
  vi.mocked(usePreferredReducedMotion).mockReturnValue(computed(() => preferredMotion.value))
})
afterEach(() => vi.unstubAllGlobals())

test('滚动位置大于零即显示回顶，到达顶部或负值时隐藏', () => {
  const { isScrolled } = useScrollToTop()
  expect(isScrolled.value).toBe(false)
  y.value = 1
  expect(isScrolled.value).toBe(true)
  y.value = 0
  expect(isScrolled.value).toBe(false)
  y.value = -1
  expect(isScrolled.value).toBe(false)
})

test('正常使用平滑滚动，减少动态效果时使用 auto', () => {
  const scroll = vi.fn()
  vi.stubGlobal('window', { scrollTo: scroll })
  const { scrollToTop } = useScrollToTop()
  scrollToTop()
  expect(scroll).toHaveBeenLastCalledWith({ top: 0, behavior: 'smooth' })
  preferredMotion.value = 'reduce'
  scrollToTop()
  expect(scroll).toHaveBeenLastCalledWith({ top: 0, behavior: 'auto' })
})

test('服务端没有 window 时可安全调用', () => {
  vi.stubGlobal('window', undefined)
  const { scrollToTop } = useScrollToTop()
  expect(() => scrollToTop()).not.toThrow()
})
