// @vitest-environment happy-dom
import type { Component } from 'vue'
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { createApp, createSSRApp, defineComponent, h, nextTick, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'
import SiteColumns from '../app/components/site/SiteColumns.vue'
import SiteProfileCard from '../app/components/site/SiteProfileCard.vue'
import { profileQuoteFallback } from '../app/features/profile/quote'

const owner = {
  name: '姬顶盒',
  avatar: 'https://q2.qlogo.cn/headimg_dl?dst_uin=1102778969&spec=0',
  introduction: ['欢迎来到我的博客！', '这里有开发、工具、游戏相关的技术见解和有趣的见闻。'],
  signature: 'while(!dead) {\n  time--;\n  exp++;\n}',
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
