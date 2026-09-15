// @vitest-environment happy-dom
import type { Component } from 'vue'
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { createApp, createSSRApp, defineComponent, h, nextTick, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'
import BorderGlow from '../app/components/base/BorderGlow.vue'
import SiteColumns from '../app/components/site/SiteColumns.vue'
import SiteProfileCard from '../app/components/site/SiteProfileCard.vue'
import { profileQuoteFallback } from '../app/features/profile/quote'

const owner = {
  name: '姬顶盒',
  avatar: 'https://q2.qlogo.cn/headimg_dl?dst_uin=1102778969&spec=0',
  introduction: ['欢迎来到我的博客！', '这里有开发、工具、游戏相关的技术见解和有趣的见闻。'],
  signature: 'while(!dead) {\n  time--; exp++;\n}',
  github: 'https://github.com/setobox',
}
const NuxtLink = defineComponent({
  props: { to: String },
  setup: (props, { slots }) => () => h('a', { href: props.to }, slots.default?.()),
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function mockMedia(reduce = false) {
  vi.spyOn(window, 'matchMedia').mockImplementation(query => ({
    matches: query.includes('prefers-reduced-motion') ? reduce : true,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: () => true,
  }))
}

function mount(component: Component, props: Record<string, unknown> = {}) {
  vi.stubGlobal('useAppConfig', () => ({ site: { name: 'Setobox', owner } }))
  vi.stubGlobal('useState', () => ref({ status: 'success', text: profileQuoteFallback }))
  const app = createApp(component, props)
  app.component('NuxtLink', NuxtLink)
  const host = document.createElement('div')
  document.body.append(host)
  app.mount(host)
  return {
    host,
    close: () => {
      app.unmount()
      host.remove()
    },
  }
}

test('头像与关于页、GitHub 链接独立可访问，使用配置中的介绍和代码签名', () => {
  const { host, close } = mount(SiteProfileCard)
  try {
    expect(host.querySelector('img')?.getAttribute('src')).toBe(owner.avatar)
    expect(host.querySelector('a[href="/about"]')?.getAttribute('aria-label')).toBe('关于姬顶盒')
    expect(host.querySelector<HTMLAnchorElement>('.profile-avatar')?.tabIndex).toBe(-1)
    expect(host.querySelector<HTMLAnchorElement>('footer a[href="/about"]')?.tabIndex).toBe(0)
    const github = host.querySelector(`a[href="${owner.github}"]`)
    expect(github?.getAttribute('target')).toBe('_blank')
    expect(github?.getAttribute('rel')).toBe('noopener noreferrer')
    expect(github?.getAttribute('aria-label')).toContain('GitHub')
    expect(host.querySelector('code')?.textContent).toBe(owner.signature)
    for (const paragraph of owner.introduction)
      expect(host.textContent).toContain(paragraph)
    expect(host.querySelector('section')?.tabIndex).toBe(0)
  }
  finally {
    close()
  }
})

test('悬停与键盘焦点均可展开介绍，内部焦点移动或仅移出鼠标不会错误收起', async () => {
  const { host, close } = mount(SiteProfileCard)
  const card = host.querySelector('section')!
  const about = host.querySelector<HTMLAnchorElement>('footer a[href="/about"]')!
  const github = host.querySelector<HTMLAnchorElement>(`a[href="${owner.github}"]`)!
  try {
    expect(card.dataset.revealed).toBe('false')
    card.dispatchEvent(new Event('pointerenter'))
    await nextTick()
    expect(card.dataset.revealed).toBe('true')
    card.dispatchEvent(new Event('pointerleave'))
    await nextTick()
    expect(card.dataset.revealed).toBe('false')
    card.focus()
    await nextTick()
    expect(card.dataset.revealed).toBe('true')
    about.focus()
    github.focus()
    card.dispatchEvent(new Event('pointerleave'))
    await nextTick()
    expect(card.dataset.revealed).toBe('true')
    github.blur()
    await nextTick()
    expect(card.dataset.revealed).toBe('false')
  }
  finally {
    close()
  }
})

test('BorderGlow 边缘跟随指针，离开后隐藏，装饰层不拦截点击', async () => {
  mockMedia()
  const { host, close } = mount(BorderGlow)
  try {
    const card = host.firstElementChild as HTMLElement
    vi.spyOn(card, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 260, 360))
    card.dispatchEvent(new Event('pointerenter'))
    card.dispatchEvent(new MouseEvent('pointermove', { clientX: 260, clientY: 180 }))
    await nextTick()
    const layers = [...card.querySelectorAll<HTMLElement>('[aria-hidden="true"]')]
    expect(layers).toHaveLength(3)
    for (const layer of layers) {
      expect(layer.classList.contains('pointer-events-none')).toBe(true)
    }
    expect(layers.map(layer => layer.style.opacity)).toEqual(['1', '0.5', '1'])
    expect(layers[0]!.style.maskImage).toContain('90.000deg')
    card.dispatchEvent(new Event('pointerleave'))
    await nextTick()
    expect(layers.every(layer => layer.style.opacity === '0')).toBe(true)
  }
  finally {
    close()
  }
})

test('减少动态效果时不读取指针位置，不显示光效或启动入场动画', async () => {
  mockMedia(true)
  const requestFrame = vi.spyOn(window, 'requestAnimationFrame')
  const { host, close } = mount(BorderGlow, { animated: true })
  try {
    const card = host.firstElementChild as HTMLElement
    const measure = vi.spyOn(card, 'getBoundingClientRect')
    card.dispatchEvent(new Event('pointerenter'))
    card.dispatchEvent(new MouseEvent('pointermove', { clientX: 260, clientY: 180 }))
    await nextTick()
    expect(measure).not.toHaveBeenCalled()
    expect(requestFrame).not.toHaveBeenCalled()
    for (const layer of card.querySelectorAll<HTMLElement>('[aria-hidden="true"]'))
      expect(layer.style.opacity).toBe('0')
  }
  finally {
    close()
  }
})

test('主要内容在 SSR 文档中先于侧栏，保留两个插槽', async () => {
  const app = createSSRApp({ render: () => h(SiteColumns, {}, {
    default: () => h('article', '文章列表'),
    sidebar: () => h('section', '角色卡片'),
  }) })
  app.component('SiteSidebar', defineComponent(() => () => null))
  const html = await renderToString(app)
  expect(html.indexOf('文章列表')).toBeLessThan(html.indexOf('角色卡片'))
  expect(html).toContain('aria-label="侧边栏"')
})
