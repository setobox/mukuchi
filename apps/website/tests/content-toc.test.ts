// @vitest-environment happy-dom
import type { Component } from 'vue'
import type { ContentTocProps, TocLink } from '../app/features/toc/model'
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test'
import { createApp, createSSRApp, defineComponent, h, nextTick, reactive, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'
import BaseCollapsible from '../app/components/base/BaseCollapsible.vue'
import ContentToc from '../app/components/toc/ContentToc.vue'
import { flattenToc } from '../app/features/toc/model'

const route = reactive({ path: '/posts/test' })
const push = vi.fn(async (_target: string) => {})
const hooks = new Map<string, Set<() => void>>()
vi.mock('#app', () => ({
  useRouter: () => ({ push }),
  useRoute: () => route,
  useNuxtApp: () => ({ hooks: {
    hook: (name: string, callback: () => void) => {
      const callbacks = hooks.get(name) ?? new Set<() => void>()
      callbacks.add(callback)
      hooks.set(name, callbacks)
      return () => callbacks.delete(callback)
    },
  } }),
}))

const links: TocLink[] = [
  { id: '安装', text: '安装', depth: 2, children: [
    { id: '环境', text: '环境', depth: 3, children: [
      { id: '深层', text: '深层', depth: 6 },
    ] },
  ] },
  { id: 'C# 与 100%', text: 'C# 与 100%', depth: 2 },
]

const observers: { callback: IntersectionObserverCallback, observe: ReturnType<typeof vi.fn>, disconnect: ReturnType<typeof vi.fn>, options?: IntersectionObserverInit }[] = []
const resizeObservers: { callback: ResizeObserverCallback, observe: ReturnType<typeof vi.fn>, disconnect: ReturnType<typeof vi.fn> }[] = []
const cleanup: (() => void)[] = []
beforeEach(() => {
  route.path = '/posts/test'
  hooks.clear()
  observers.length = 0
  resizeObservers.length = 0
  push.mockClear()
  vi.stubGlobal('IntersectionObserver', class {
    observe = vi.fn()
    disconnect = vi.fn()
    constructor(public callback: IntersectionObserverCallback, public options?: IntersectionObserverInit) { observers.push(this) }
  })
  vi.stubGlobal('ResizeObserver', class {
    observe = vi.fn()
    unobserve = vi.fn()
    disconnect = vi.fn()
    constructor(public callback: ResizeObserverCallback) { resizeObservers.push(this) }
  })
  for (const { link } of flattenToc(links)) {
    const heading = document.createElement(`h${link.depth}`)
    heading.id = link.id
    document.body.append(heading)
    cleanup.push(() => heading.remove())
  }
})
afterEach(() => {
  cleanup.splice(0).reverse().forEach(close => close())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function mount(component: Component = ContentToc, props: Record<string, unknown> = { links, highlight: true, highlightVariant: 'circuit' }) {
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp(component, props)
  app.mount(host)
  const close = () => {
    app.unmount()
    host.remove()
  }
  cleanup.push(close)
  return host
}

async function intersect(entries: [string, boolean][], observer = observers.at(-1)!) {
  observer.callback(entries.map(([id, isIntersecting]) => ({ target: document.getElementById(id)!, isIntersecting }) as IntersectionObserverEntry), {} as IntersectionObserver)
  await nextTick()
}

test.each([0, 3])('SSR 输出目录和编码后的锚点，客户端水合保持结构和默认收起状态（预览 %i 行）', async (collapsedRows) => {
  const props: ContentTocProps = { links, highlight: true, highlightVariant: 'circuit', collapsedRows }
  const html = await renderToString(createSSRApp(ContentToc, props))
  expect(html).toContain('aria-label="文章目录"')
  expect(html).toContain('aria-expanded="false"')
  expect(html).toContain(`#${encodeURIComponent('C# 与 100%')}`)
  expect(html).toContain('data:image/svg+xml,')
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.append(host)
  const error = vi.spyOn(console, 'error')
  const warn = vi.spyOn(console, 'warn')
  const app = createSSRApp(ContentToc, props)
  app.mount(host)
  cleanup.push(() => {
    app.unmount()
    host.remove()
  })
  await nextTick()
  expect(error).not.toHaveBeenCalled()
  expect(warn).not.toHaveBeenCalled()
  const content = host.querySelector<HTMLElement>('[data-slot="content"]')!
  if (collapsedRows > 0) {
    expect(content.hasAttribute('hidden')).toBe(false)
    expect(content.querySelectorAll('a')).toHaveLength(4)
    expect(content.querySelector<HTMLElement>('[data-slot="viewport"]')?.style.height).toBe('5.25rem')
  }
  else {
    expect(content.hasAttribute('hidden')).toBe(true)
  }
})

test('空目录不显示空导航，默认不启用高亮，straight 使用直线', async () => {
  const html = await renderToString(createSSRApp(ContentToc))
  expect(html).not.toContain('<nav')
  expect(mount(ContentToc, { links }).querySelector('[data-slot="indicator"]')).toBeNull()
  const straight = mount(ContentToc, { links, highlight: true }).querySelector<HTMLElement>('[data-slot="indicator"]')!
  expect(straight.style.maskImage).toBe('')
  expect(straight.classList.contains('w-px')).toBe(true)
})

test('同时高亮可见标题，按文档顺序计算范围，没有可见标题时保留上一组', async () => {
  const host = mount()
  expect(observers[0]!.observe).toHaveBeenCalledTimes(4)
  expect(host.querySelector('[aria-current]')).toBeNull()
  await intersect([['深层', true], ['环境', true]])
  expect([...host.querySelectorAll('[aria-current]')].map(link => link.textContent?.trim())).toEqual(['环境', '深层'])
  const indicator = host.querySelector<HTMLElement>('[data-slot="indicator"]')!
  expect(indicator.style.getPropertyValue('--indicator-position')).toBe('1.75rem')
  expect(indicator.style.getPropertyValue('--indicator-size')).toBe('3.5rem')
  await intersect([['环境', false], ['深层', false]])
  expect(host.querySelectorAll('[aria-current]')).toHaveLength(2)
  await intersect([['C# 与 100%', true]])
  expect(host.querySelectorAll('[aria-current]')).toHaveLength(1)
  expect(indicator.style.getPropertyValue('--indicator-position')).toBe('5.25rem')
})

test('折叠支持 defaultOpen、受控状态和 update:open，关闭后仍保留桌面目录', async () => {
  const initial = mount(ContentToc, { links, defaultOpen: true })
  expect(initial.querySelector('button')?.getAttribute('aria-expanded')).toBe('true')
  const controlled = ref(false)
  const update = vi.fn((value: boolean) => {
    controlled.value = value
  })
  const host = mount(defineComponent(() => () => h(ContentToc, { links, 'open': controlled.value, 'onUpdate:open': update })), {})
  const trigger = host.querySelector<HTMLButtonElement>('button')!
  trigger.click()
  await nextTick()
  expect(update).toHaveBeenLastCalledWith(true)
  expect(trigger.getAttribute('aria-expanded')).toBe('true')
  expect(trigger.getAttribute('aria-controls')).toBeTruthy()
  controlled.value = false
  await nextTick()
  expect(trigger.getAttribute('aria-expanded')).toBe('false')
  expect(host.querySelector('a')).not.toBeNull()
})

test('点击编码锚点触发 move 并定位和聚焦正文标题', async () => {
  const move = vi.fn()
  const host = mount(ContentToc, { links, onMove: move })
  const heading = document.getElementById('C# 与 100%')!
  const scroll = vi.spyOn(heading, 'scrollIntoView')
  host.querySelector<HTMLAnchorElement>(`a[href="#${encodeURIComponent(heading.id)}"]`)!.click()
  await nextTick()
  await nextTick()
  expect(push).toHaveBeenCalledWith(`#${encodeURIComponent(heading.id)}`)
  expect(move).toHaveBeenCalledWith(heading.id)
  expect(scroll).toHaveBeenCalledWith({ block: 'start', behavior: 'instant' })
  expect(document.activeElement).toBe(heading)
})

test('目录定位折叠内部标题时等待展开，并在内容可见后聚焦', async () => {
  const host = mount(defineComponent(() => () => h('div', [
    h(ContentToc, { links: [{ id: '折叠目标', text: '折叠目标', depth: 2 }] }),
    h(BaseCollapsible, {}, {
      trigger: () => h('button', '补充说明'),
      default: () => h('h2', { id: '折叠目标' }, '折叠目标'),
    }),
  ])), {})
  const heading = host.querySelector<HTMLElement>('h2')!
  const scroll = vi.spyOn(heading, 'scrollIntoView').mockImplementation(() => {
    expect(heading.closest('[inert]')).toBeNull()
  })
  host.querySelector<HTMLAnchorElement>('a[data-slot="link"]')!.click()
  for (let index = 0; index < 8; index++) await nextTick()
  expect(scroll).toHaveBeenCalledOnce()
  expect(document.activeElement).toBe(heading)
})

test('文章切换重置折叠和高亮，重新绑定标题并忽略旧观察回调', async () => {
  const host = mount(ContentToc, { links, defaultOpen: true })
  const old = observers[0]!
  await intersect([['环境', true]])
  route.path = '/posts/next'
  await nextTick()
  expect(old.disconnect).toHaveBeenCalled()
  expect(host.querySelector('button')?.getAttribute('aria-expanded')).toBe('false')
  expect(host.querySelector('[aria-current]')).toBeNull()
  await intersect([['环境', true]], old)
  expect(host.querySelector('[aria-current]')).toBeNull()
  hooks.get('page:loading:end')?.forEach(callback => callback())
  expect(observers.at(-1)!.observe).toHaveBeenCalledTimes(4)
})

test('链接更新后移除旧观察，卸载时释放观察器和 Nuxt 钩子', async () => {
  const current = ref(links)
  const host = mount(defineComponent(() => () => h(ContentToc, { links: current.value })), {})
  const old = observers[0]!
  current.value = []
  await nextTick()
  expect(old.disconnect).toHaveBeenCalled()
  expect(host.querySelector('nav')).toBeNull()
  cleanup.pop()!()
  expect([...hooks.values()].every(callbacks => callbacks.size === 0)).toBe(true)
})

// happy-dom has no layout engine. Supply row geometry at the DOM boundary, so the
// assertions exercise the real component, its observers and its scroll API.
function previewLayout(host: HTMLElement) {
  const viewport = host.querySelector<HTMLElement>('[data-slot="viewport"]')!
  const list = host.querySelector<HTMLElement>('[data-slot="list"]')!
  const anchors = [...list.querySelectorAll<HTMLAnchorElement>('a')]
  Object.defineProperties(viewport, {
    clientHeight: { configurable: true, get: () => 84 },
    scrollHeight: { configurable: true, get: () => anchors.length * 28 },
  })
  vi.spyOn(list, 'getBoundingClientRect').mockImplementation(() => new DOMRect(0, -viewport.scrollTop, 200, anchors.length * 28))
  anchors.forEach((anchor, index) => {
    vi.spyOn(anchor, 'getBoundingClientRect').mockImplementation(() => new DOMRect(0, index * 28 - viewport.scrollTop, 200, 28))
  })
  const scroll = vi.spyOn(viewport, 'scrollTo').mockImplementation((options?: ScrollToOptions | number) => {
    if (typeof options === 'object')
      viewport.scrollTop = options.top ?? 0
  })
  return {
    viewport,
    anchors,
    scroll,
  }
}

test('预览居中跟随首个高亮并限制首尾，只滚动目录且保留手动浏览位置', async () => {
  const host = mount(ContentToc, { links, collapsedRows: 3, highlight: true, highlightVariant: 'circuit' })
  const { viewport, scroll, anchors } = previewLayout(host)
  const pageScroll = vi.spyOn(window, 'scrollTo')
  const intoView = vi.spyOn(HTMLElement.prototype, 'scrollIntoView')
  const move = vi.fn()
  anchors[0]!.addEventListener('click', move)
  anchors[0]!.focus()
  await intersect([['深层', true], ['C# 与 100%', true]])
  expect(scroll).toHaveBeenLastCalledWith({ top: 28, behavior: 'instant' })
  expect(viewport.querySelectorAll('[aria-current]')).toHaveLength(2)
  // Manual browsing remains untouched if the first active heading is unchanged.
  viewport.scrollTop = 0
  scroll.mockClear()
  await intersect([['C# 与 100%', false]])
  expect(scroll).not.toHaveBeenCalled()
  await intersect([['深层', false]])
  expect(scroll).not.toHaveBeenCalled()
  await intersect([['C# 与 100%', true]])
  expect(scroll).toHaveBeenLastCalledWith({ top: 28, behavior: 'smooth' })
  await intersect([['C# 与 100%', false], ['安装', true]])
  expect(scroll).toHaveBeenLastCalledWith({ top: 0, behavior: 'smooth' })
  expect(document.activeElement).toBe(anchors[0])
  expect(pageScroll).not.toHaveBeenCalled()
  expect(intoView).not.toHaveBeenCalled()
  expect(push).not.toHaveBeenCalled()
  expect(move).not.toHaveBeenCalled()
})

test('预览切换文章和链接后重置位置，旧回调及卸载不再滚动', async () => {
  const current = ref(links)
  const host = mount(defineComponent(() => () => h(ContentToc, { links: current.value, collapsedRows: 3 })), {})
  const { scroll } = previewLayout(host)
  await nextTick()
  await intersect([['C# 与 100%', true]])
  const old = observers.at(-1)!
  route.path = '/posts/next'
  await nextTick()
  expect(scroll).toHaveBeenLastCalledWith({ top: 0, behavior: 'instant' })
  scroll.mockClear()
  await intersect([['深层', true]], old)
  expect(scroll).not.toHaveBeenCalled()
  await intersect([['深层', true]])
  expect(scroll).toHaveBeenLastCalledWith({ top: 28, behavior: 'instant' })
  current.value = [links[0]!]
  await nextTick()
  expect(scroll).toHaveBeenLastCalledWith({ top: 0, behavior: 'instant' })
  const latest = observers.at(-1)!
  cleanup.pop()!()
  scroll.mockClear()
  await intersect([['环境', true]], latest)
  expect(scroll).not.toHaveBeenCalled()
  expect(latest.disconnect).toHaveBeenCalled()
  expect(resizeObservers.every(observer => observer.disconnect.mock.calls.length > 0)).toBe(true)
})

test('弹窗目录只观察并滚动本容器的同名标题，不修改页面路由', async () => {
  const viewport = document.createElement('div')
  const heading = document.createElement('h2')
  heading.id = '安装'
  viewport.append(heading)
  document.body.append(viewport)
  cleanup.push(() => viewport.remove())
  const scroll = vi.spyOn(viewport, 'scrollTo')
  const host = mount(ContentToc, { links, scrollRoot: viewport, layout: 'container', collapsedRows: 3, highlight: true })
  await nextTick()
  const observer = observers.at(-1)!
  expect(observer.options?.root).toBe(viewport)
  expect(observer.observe.mock.calls.map(call => call[0])).toEqual([heading])
  observer.callback([{ target: heading, isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
  await nextTick()
  expect(host.querySelector('a[aria-current="location"]')?.textContent).toContain('安装')
  host.querySelector<HTMLAnchorElement>('a')!.click()
  await nextTick()
  expect(push).not.toHaveBeenCalled()
  expect(scroll).toHaveBeenCalled()
  expect(document.activeElement).toBe(heading)
})
