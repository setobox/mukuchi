// @vitest-environment happy-dom
import type { Component } from 'vue'
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { computed, createApp, createSSRApp, defineComponent, h, nextTick, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'
import AdminSeriesFields from '../app/components/admin/AdminSeriesFields.vue'
import AppIcon from '../app/components/AppIcon.vue'
import CatalogStatus from '../app/components/content-index/CatalogStatus.vue'
import ArticleSeries from '../app/components/series/ArticleSeries.vue'
import SeriesDirectory from '../app/components/series/SeriesDirectory.vue'
import SeriesDisclosure from '../app/components/series/SeriesDisclosure.vue'
import ContentEmptyState from '../app/components/site/ContentEmptyState.vue'
import PageHeading from '../app/components/site/PageHeading.vue'
import SeriesPage from '../app/pages/series.vue'
import { updateMetadata } from '../shared/admin/metadata'
import { readFrontmatter, splitDocument } from '../shared/content/document'
import { collectSeries } from '../shared/content/series'

const posts = [
  { title: '当前文章', publish: '2026-09-26', path: '/posts/current', series: 'A / C# 100%', seriesOrder: 2 },
  { title: '开篇：很长的文章标题'.repeat(8), publish: '2026-09-26', path: '/posts/intro', series: 'A / C# 100%', seriesOrder: 0 },
  { title: '另一个系列', publish: '2026-09-26', path: '/posts/other', series: 'B', seriesOrder: 1 },
]
const groups = collectSeries(posts)
const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).reverse().forEach(close => close())
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
function appFor(component: Component, props: Record<string, unknown>, ssr = false) {
  const app = (ssr ? createSSRApp : createApp)(component, props)
  app.component('NuxtLink', defineComponent({ props: ['to'], setup: (props, { slots }) => () => h('a', { href: props.to }, slots.default?.()) }))
  app.component('BaseButton', defineComponent({ setup: (_, { slots }) => () => h('button', slots.default?.()) }))
  app.component('SiteColumns', defineComponent({ setup: (_, { slots }) => () => h('div', slots.default?.()) }))
  for (const [name, child] of Object.entries({ AppIcon, CatalogStatus, ContentEmptyState, PageHeading, SeriesDirectory })) app.component(name, child)
  return app
}
function mount(component: Component, props: Record<string, unknown>) {
  const host = document.createElement('div')
  document.body.append(host)
  const app = appFor(component, props)
  app.mount(host)
  cleanups.push(() => {
    app.unmount()
    host.remove()
  })
  return host
}
function catalog() {
  const data = ref<typeof posts | null>(posts)
  const status = ref('success')
  const error = ref<Error | null>(null)
  const refresh = vi.fn()
  vi.stubGlobal('usePostCatalog', () => ({ data, status, error, refresh, series: computed(() => collectSeries(data.value ?? [])) }))
  return { data, status, error, refresh }
}
const triggers = (host: Element) => [...host.querySelectorAll<HTMLButtonElement>('button[aria-expanded]')]

test('系列总览 SSR 包含完整目录，默认全收起；水合保持唯一关联且没有警告', async () => {
  const host = document.createElement('div')
  host.innerHTML = await renderToString(appFor(SeriesDirectory, { groups }, true))
  document.body.append(host)
  const controls = triggers(host).map(button => button.getAttribute('aria-controls'))
  expect(new Set(controls).size).toBe(2)
  expect(host.querySelectorAll('a')).toHaveLength(3)
  expect(triggers(host).map(button => button.getAttribute('aria-expanded'))).toEqual(['false', 'false'])
  expect(host.querySelectorAll('[inert]')).toHaveLength(2)
  const warn = vi.spyOn(console, 'warn')
  const error = vi.spyOn(console, 'error')
  const app = appFor(SeriesDirectory, { groups }, true)
  app.mount(host)
  cleanups.push(() => {
    app.unmount()
    host.remove()
  })
  await nextTick()
  expect(triggers(host).map(button => button.getAttribute('aria-controls'))).toEqual(controls)
  expect(warn).not.toHaveBeenCalled()
  expect(error).not.toHaveBeenCalled()
})

test('一次展开一个系列，连续切换后状态一致；收起当前焦点区域会恢复触发按钮焦点', async () => {
  const host = mount(SeriesDirectory, { groups })
  const [first, second] = triggers(host)
  first!.click()
  await nextTick()
  expect(first!.getAttribute('aria-expanded')).toBe('true')
  host.querySelector<HTMLAnchorElement>('a')!.focus()
  second!.click()
  await nextTick()
  expect(document.activeElement).toBe(first)
  expect(triggers(host).map(button => button.getAttribute('aria-expanded'))).toEqual(['false', 'true'])
  first!.click()
  await nextTick()
  first!.click()
  await nextTick()
  expect(triggers(host).map(button => button.getAttribute('aria-expanded'))).toEqual(['false', 'false'])
  expect(host.querySelectorAll('[inert]')).toHaveLength(2)
})

test('文章目录显示排序后篇目序号、当前项和完整长标题，可以独立展开', async () => {
  const host = mount(SeriesDisclosure, { group: groups[0], currentPath: '/posts/current' })
  const button = triggers(host)[0]!
  expect(button.textContent).toContain('正在阅读第 2 篇')
  expect(button.getAttribute('aria-expanded')).toBe('false')
  button.click()
  await nextTick()
  expect(button.getAttribute('aria-expanded')).toBe('true')
  const links = [...host.querySelectorAll('a')]
  expect(links.map(link => link.getAttribute('href'))).toEqual(['/posts/intro', '/posts/current'])
  expect(links[0]!.textContent).toContain(posts[1]!.title)
  expect(links[1]!.textContent).toContain('第 2 篇：')
  expect(links[1]!.textContent).toContain('本文')
  expect(links[1]!.getAttribute('aria-current')).toBe('page')
})

test('系列页面使用真实目录，空态、加载、失败及重试均不误显示为零篇', async () => {
  const state = catalog()
  vi.stubGlobal('definePageMeta', vi.fn())
  vi.stubGlobal('useSeoMeta', vi.fn())
  vi.stubGlobal('usePostListActions', vi.fn())
  const host = mount(SeriesPage, {})
  expect(host.querySelector('h1')?.textContent).toBe('系列')
  expect(host.textContent).toContain('共 2 个系列 · 3 篇文章')
  state.data.value = null
  state.status.value = 'pending'
  await nextTick()
  expect(host.textContent).toContain('正在加载系列')
  expect(host.textContent).not.toContain('暂无系列')
  state.error.value = new Error('offline')
  await nextTick()
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('系列加载失败')
  host.querySelector('button')!.click()
  expect(state.refresh).toHaveBeenCalledOnce()
  state.error.value = null
  state.status.value = 'success'
  state.data.value = []
  await nextTick()
  expect(host.textContent).toContain('暂无系列')
  expect(host.querySelectorAll('a')).toHaveLength(0)
})

test('文章同系列目录复用数据，查询失败可重试；不存在的系列不显示空框', async () => {
  const state = catalog()
  const host = mount(ArticleSeries, { name: 'A / C# 100%', currentPath: '/posts/current' })
  expect(host.textContent).toContain('当前文章')
  expect(host.textContent).not.toContain('另一个系列')
  state.error.value = new Error('offline')
  await nextTick()
  expect(host.textContent).toContain('系列目录加载失败')
  host.querySelector('button')!.click()
  expect(state.refresh).toHaveBeenCalledOnce()
  state.error.value = null
  state.data.value = []
  await nextTick()
  expect(host.querySelector('section')).toBeNull()
})

test('后台字段修改 YAML 时保留正文和注释，0 不丢失、空顺序可删除、清空系列同时删序号', async () => {
  const source = ref('---\ntitle: 文章 # 保留注释\ndescription: ""\npublish: "2026-09-26"\n---\n\n::collapse{title="保持原文"}\n正文\n::\n')
  const originalBody = splitDocument(source.value).body
  const host = mount(defineComponent({ setup: () => () => h(AdminSeriesFields, { metadata: readFrontmatter(source.value, 'draft') as Record<string, unknown>, onChange: patch => source.value = updateMetadata(source.value, patch) }) }), {})
  const [name, order] = [...host.querySelectorAll<HTMLInputElement>('input')]
  expect(order!.disabled).toBe(true)
  name!.value = 'Vue '
  name!.dispatchEvent(new Event('input', { bubbles: true }))
  await nextTick()
  expect(order!.disabled).toBe(false)
  expect(name!.value).toBe('Vue ')
  expect(readFrontmatter(source.value, 'draft')).not.toHaveProperty('series')
  async function change(input: HTMLInputElement, value: string) {
    input.value = value
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await nextTick()
  }
  await change(name!, ' Vue / C# 100% ')
  expect(order!.disabled).toBe(false)
  await change(order!, '0')
  expect(readFrontmatter(source.value, 'draft')).toMatchObject({ series: 'Vue / C# 100%', seriesOrder: 0 })
  await change(order!, '-1')
  expect(order!.getAttribute('aria-invalid')).toBe('true')
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('不能小于 0')
  await change(order!, '')
  expect(readFrontmatter(source.value, 'draft')).not.toHaveProperty('seriesOrder')
  await change(order!, '2')
  await change(name!, '')
  expect(readFrontmatter(source.value, 'draft')).not.toHaveProperty('series')
  expect(readFrontmatter(source.value, 'draft')).not.toHaveProperty('seriesOrder')
  expect(order!.disabled).toBe(true)
  expect(source.value).toContain('# 保留注释')
  expect(splitDocument(source.value).body).toBe(originalBody)
  expect(() => updateMetadata('---\ntitle: [broken\n---\n正文', { series: 'Vue' })).toThrow(/YAML/)
})
