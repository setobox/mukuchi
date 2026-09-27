// @vitest-environment happy-dom
import type { Ref } from 'vue'
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { createApp, nextTick, ref } from 'vue'
import AppIcon from '../app/components/AppIcon.vue'
import ResourceLinkCard from '../app/components/collections/ResourceLinkCard.vue'
import ResourceSection from '../app/components/collections/ResourceSection.vue'

const state = vi.hoisted(() => ({
  reduced: null as Ref<'reduce' | 'no-preference'> | null,
  fromTo: vi.fn(),
  to: vi.fn(),
  set: vi.fn(),
  revert: vi.fn(),
  context: vi.fn(),
}))
vi.mock('@vueuse/core', async original => ({
  ...await original<typeof import('@vueuse/core')>(),
  usePreferredReducedMotion: () => state.reduced,
}))
vi.mock('gsap', () => ({ gsap: {
  ...state,
  context: () => {
    state.context()
    return { add: (callback: () => void) => callback(), revert: state.revert }
  },
} }))

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).reverse().forEach(cleanup => cleanup())
  vi.clearAllMocks()
})

async function mount(reduce = false) {
  state.reduced = ref(reduce ? 'reduce' : 'no-preference')
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp(ResourceSection, { group: { title: '资源', items: [
    { title: '文档', description: '', href: 'https://example.com' },
    { title: '工具', description: '', href: 'https://example.org' },
  ] } })
  app.component('ResourceLinkCard', ResourceLinkCard)
  app.component('AppIcon', AppIcon)
  app.mount(host)
  const close = () => {
    app.unmount()
    host.remove()
  }
  cleanups.push(close)
  await vi.waitFor(() => expect(state.context).toHaveBeenCalled())
  return { host, links: [...host.querySelectorAll('a')], close }
}

function pointer(link: Element, type: string, pointerType = 'mouse', relatedTarget: Element | null = null) {
  link.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType, relatedTarget }))
}

test('初次显示和滚动时分组保持可见且不启动位移动画；离页回收 GSAP', async () => {
  const { host, close } = await mount()
  window.dispatchEvent(new Event('scroll'))
  await nextTick()
  expect(state.fromTo).not.toHaveBeenCalled()
  expect(state.to).not.toHaveBeenCalled()
  expect(state.set).not.toHaveBeenCalled()
  for (const entry of host.querySelectorAll<HTMLElement>('h2, li')) {
    expect(entry.style.opacity).toBe('')
    expect(entry.style.transform).toBe('')
  }
  close()
  cleanups.pop()
  expect(state.revert).toHaveBeenCalledOnce()
})

test('触屏不触发悬停，鼠标移出保留键盘焦点效果，失焦后复位，快速操作覆盖旧动画', async () => {
  const { links, close } = await mount()
  const first = links[0]!
  pointer(first, 'pointerover', 'touch')
  expect(state.to).not.toHaveBeenCalled()
  pointer(first, 'pointerover')
  expect(state.to).toHaveBeenCalledTimes(3)
  expect(state.to.mock.calls[0]![1]).toMatchObject({ scale: 1.08, overwrite: true })
  first.focus()
  pointer(first, 'pointerout')
  expect(state.to.mock.calls.at(-3)![1]).toMatchObject({ scale: 1.08 })
  first.blur()
  expect(state.to.mock.calls.at(-3)![1]).toMatchObject({ scale: 1, clearProps: 'transform' })
  close()
  cleanups.pop()
  const count = state.to.mock.calls.length
  pointer(first, 'pointerover')
  expect(state.to).toHaveBeenCalledTimes(count)
})

test('减少动态效果时内容始终可见；运行中切换偏好立即撤销动画', async () => {
  const { host, links } = await mount(true)
  pointer(links[0]!, 'pointerover')
  expect(state.fromTo).not.toHaveBeenCalled()
  expect(state.to).not.toHaveBeenCalled()
  expect(host.querySelector('li')!.style.opacity).toBe('')
  state.reduced!.value = 'no-preference'
  await nextTick()
  pointer(links[0]!, 'pointerout')
  pointer(links[0]!, 'pointerover')
  expect(state.to).toHaveBeenCalled()
  const reverts = state.revert.mock.calls.length
  state.reduced!.value = 'reduce'
  await nextTick()
  expect(state.revert).toHaveBeenCalledTimes(reverts + 1)
  const count = state.to.mock.calls.length
  pointer(links[1]!, 'pointerover')
  expect(state.to).toHaveBeenCalledTimes(count)
})
