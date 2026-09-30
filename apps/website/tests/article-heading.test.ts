// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { createApp, h, nextTick } from 'vue'
import ArticleHeading from '../app/components/content/ArticleHeading.vue'

const cleanup: (() => void)[] = []
afterEach(() => {
  cleanup.splice(0).forEach(close => close())
  vi.restoreAllMocks()
})

async function mount(reduce = false) {
  vi.spyOn(window, 'matchMedia').mockImplementation(query => ({ matches: reduce, media: query, onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: () => true }))
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({ render: () => h(ArticleHeading, { id: '标题', level: 6 }, () => ['标题 ', h('code', 'code')]) })
  app.mount(host)
  cleanup.push(() => {
    app.unmount()
    host.remove()
  })
  const heading = host.querySelector('h6')!
  const text = heading.querySelector<HTMLElement>('.article-heading-text')!
  const hashes = [...heading.querySelectorAll<HTMLElement>('.article-heading-hashes > span')]
  await vi.waitFor(() => expect(heading.hasAttribute('data-motion-ready')).toBe(true))
  return { heading, text, hashes }
}

test('减少动态效果时立即切换，键盘焦点保留反馈，触摸不留下 hover 状态', async () => {
  const { heading, text, hashes } = await mount(true)
  const anchor = heading.querySelector('a')!
  expect(anchor.getAttribute('href')).toBe('#标题')
  expect(text.querySelector('code')?.textContent).toBe('code')
  expect(hashes[0]?.parentElement?.getAttribute('aria-hidden')).toBe('true')
  heading.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'touch' }))
  await nextTick()
  expect(text.style.getPropertyValue('--heading-underline')).toBe('0%')
  anchor.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
  await nextTick()
  expect(text.style.getPropertyValue('--heading-underline')).toBe('100%')
  expect(hashes.every(hash => hash.style.opacity === '1')).toBe(true)
  heading.dispatchEvent(new PointerEvent('pointerleave'))
  await nextTick()
  expect(text.style.getPropertyValue('--heading-underline')).toBe('100%')
  anchor.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
  await nextTick()
  expect(text.style.getPropertyValue('--heading-underline')).toBe('0%')
})
