// @vitest-environment happy-dom
import type { ResourceGroup } from '../shared/collections/types'
import { createGenerator } from 'unocss'
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { createApp, createSSRApp, nextTick, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'
import AppIcon from '../app/components/AppIcon.vue'
import BaseButton from '../app/components/base/BaseButton.vue'
import ResourceLinkCard from '../app/components/collections/ResourceLinkCard.vue'
import ResourceSection from '../app/components/collections/ResourceSection.vue'
import ContentEmptyState from '../app/components/site/ContentEmptyState.vue'
import PageHeading from '../app/components/site/PageHeading.vue'
import CollectionsPage from '../app/pages/collections.vue'
import unoConfig from '../uno.config'

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).reverse().forEach(cleanup => cleanup())
  vi.unstubAllGlobals()
})

function fixture() {
  const data = ref<ResourceGroup[]>([])
  const error = ref<Error | null>(null)
  const status = ref('idle')
  const refresh = vi.fn(() => {
    status.value = 'pending'
  })
  const fetcher = vi.fn(() => ({ data, error, status, refresh }))
  vi.stubGlobal('useLazyFetch', fetcher)
  vi.stubGlobal('definePageMeta', vi.fn())
  vi.stubGlobal('useSeoMeta', vi.fn())
  return { data, error, status, refresh, fetcher }
}
function appFor(ssr = false) {
  const app = (ssr ? createSSRApp : createApp)(CollectionsPage)
  for (const [name, component] of Object.entries({ AppIcon, BaseButton, ResourceLinkCard, ResourceSection, ContentEmptyState, PageHeading }))
    app.component(name, component)
  return app
}
function mount() {
  const host = document.createElement('div')
  document.body.append(host)
  const app = appFor()
  app.mount(host)
  cleanups.push(() => {
    app.unmount()
    host.remove()
  })
  return host
}

test('预渲染外壳有标题、简介和加载提示，获取数据仅在客户端进行', async () => {
  const state = fixture()
  const html = await renderToString(appFor(true))
  expect(html).toContain('导航')
  expect(html).toContain('网站、开发资源与在线工具收藏。')
  expect(html).toContain('正在加载')
  expect(html).not.toContain('暂无数据')
  expect(state.fetcher).toHaveBeenCalledWith('/api/collections', expect.objectContaining({ server: false, key: 'collection-groups' }))
})

test('加载、失败、重试禁用、成功空态及有数据状态正常切换', async () => {
  const state = fixture()
  const host = mount()
  expect(host.querySelector('h1')?.textContent).toBe('导航')
  expect(host.querySelector('[role="status"]')?.textContent).toContain('正在加载')
  state.status.value = 'error'
  state.error.value = new Error('offline')
  await nextTick()
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('数据加载失败')
  host.querySelector('button')!.click()
  await nextTick()
  expect(host.querySelector('button')!.disabled).toBe(true)
  host.querySelector('button')!.click()
  expect(state.refresh).toHaveBeenCalledOnce()
  state.error.value = null
  state.status.value = 'success'
  await nextTick()
  expect(host.textContent).toContain('暂无数据')
  state.data.value = [{ title: '空分组', items: [] }]
  await nextTick()
  expect(host.querySelector('h2')?.textContent).toBe('空分组')
  expect(host.textContent).toContain('暂无条目')
  expect(host.textContent).not.toContain('暂无数据')
})

test('站点顺序、简介、外链属性及图标失败回退；链接可聚焦', async () => {
  const state = fixture()
  state.status.value = 'success'
  state.data.value = [{ title: '开发', items: [
    { title: '文档', description: '查询文档', href: 'https://example.com', imageUrl: 'https://example.com/icon.png' },
    { title: '工具', description: '', href: 'https://example.org' },
  ] }]
  const host = mount()
  const links = [...host.querySelectorAll('a')]
  expect(links.map(link => link.href)).toEqual(['https://example.com/', 'https://example.org/'])
  for (const link of links) {
    expect(link.target).toBe('_blank')
    expect(link.rel).toBe('noopener noreferrer')
  }
  expect(links[0]!.textContent).toContain('查询文档')
  links[0]!.focus()
  expect(document.activeElement).toBe(links[0])
  expect(host.querySelectorAll('.i-lucide-link-2')).toHaveLength(1)
  host.querySelector('img')!.dispatchEvent(new Event('error'))
  await nextTick()
  expect(host.querySelector('img')).toBeNull()
  expect(host.querySelectorAll('.i-lucide-link-2')).toHaveLength(2)
  state.data.value[0]!.items[0]!.imageUrl = 'https://example.com/new.png'
  await nextTick()
  expect(host.querySelector('img')?.src).toBe('https://example.com/new.png')
})

test('链接悬停不出现下划线，键盘焦点仍有下划线提示', async () => {
  const state = fixture()
  state.status.value = 'success'
  state.data.value = [{ title: '资源', items: [{ title: '文档', description: '说明', href: 'https://example.com' }] }]
  const host = mount()
  const uno = await createGenerator(unoConfig)
  const { css } = await uno.generate(host.outerHTML)
  const style = document.createElement('style')
  // Happy DOM does not implement pointer hover or focus-visible matching.
  style.textContent = css.replace(/(?<!\\):hover\b/g, '[data-hover]').replace(/(?<!\\):focus-visible\b/g, '[data-focus]')
  document.head.append(style)
  cleanups.push(() => style.remove())
  const link = host.querySelector('a')!
  const decoration = () => {
    const computed = getComputedStyle(link)
    return computed.textDecorationLine || computed.textDecoration
  }
  link.setAttribute('data-hover', '')
  expect(decoration()).toBe('none')
  link.removeAttribute('data-hover')
  link.setAttribute('data-focus', '')
  expect(decoration()).toBe('underline')
})
