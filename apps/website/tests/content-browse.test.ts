// @vitest-environment happy-dom
import type { Component } from 'vue'
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { computed, createApp, createSSRApp, defineComponent, h, nextTick, onMounted, ref, useId, useTemplateRef, watch } from 'vue'
import { renderToString } from 'vue/server-renderer'
import ArchiveTimeline from '../app/components/archive/ArchiveTimeline.vue'
import CategoryNavigation from '../app/components/categories/CategoryNavigation.vue'
import CatalogStatus from '../app/components/content-index/CatalogStatus.vue'
import TaxonomyDirectory from '../app/components/content-index/TaxonomyDirectory.vue'
import TaxonomyIndex from '../app/components/content-index/TaxonomyIndex.vue'
import ContentEmptyState from '../app/components/site/ContentEmptyState.vue'
import PageHeading from '../app/components/site/PageHeading.vue'
import { archiveYears, rankTerms, searchTerms } from '../shared/content/browse'

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).reverse().forEach(close => close())
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
const posts = [
  { title: '旧的置顶文章', publish: '2023-12-31', path: '/posts/old', pin: 10 },
  { title: '同日乙', publish: '2024-02-29', path: '/posts/b', pin: 8 },
  { title: '最新文章', publish: '2026-01-01', path: '/posts/new', pin: 0 },
  { title: '同日甲', publish: '2024-02-29', path: '/posts/a', pin: 0 },
]
const terms = [{ name: 'Vue', count: 2 }, { name: 'C++', count: 1 }, { name: 'C#', count: 1 }, { name: '100%', count: 4 }]
const NuxtLink = defineComponent({ props: ['to'], setup: (props, { slots }) => () => h('a', { href: props.to }, slots.default?.()) })
const Container = defineComponent({ setup: (_, { slots }) => () => h('div', slots.default?.()) })
const components = {
  NuxtLink,
  CatalogStatus,
  TaxonomyDirectory,
  TaxonomyIndex,
  ContentEmptyState,
  PageHeading,
  SiteColumns: Container,
  AppIcon: { render: () => h('span') },
  BaseButton: defineComponent({ setup: (_, { slots }) => () => h('button', slots.default?.()) }),
}
function appFor(component: Component, props: Record<string, unknown>, ssr = false) {
  const app = (ssr ? createSSRApp : createApp)(component, props)
  for (const [name, child] of Object.entries(components)) app.component(name, child)
  return app
}
function mount(component: Component, initial: Record<string, unknown>) {
  const props = ref(initial)
  const app = appFor({ render: () => h(component, props.value) }, {})
  const host = document.createElement('div')
  document.body.append(host)
  app.mount(host)
  cleanups.push(() => {
    app.unmount()
    host.remove()
  })
  return { host, props }
}

test('归档跨年倒序，同日按序号与路径排序且忽略置顶；不修改原数组', () => {
  const before = structuredClone(posts)
  expect(archiveYears(posts).map(group => [group.year, group.articles.map(post => post.path)])).toEqual([
    ['2026', ['/posts/new']],
    ['2024', ['/posts/a', '/posts/b']],
    ['2023', ['/posts/old']],
  ])
  expect(posts).toEqual(before)
  expect(archiveYears([])).toEqual([])
  const numbered = [
    { ...posts[1]!, stem: '2.b' },
    { ...posts[3]!, stem: '1.a' },
  ]
  expect(archiveYears(numbered)[0]!.articles.map(post => post.path)).toEqual(['/posts/b', '/posts/a'])
})

test('年份独立折叠，最新年份默认展开，日期和总数完整且 SSR 保留全部文章', async () => {
  const html = await renderToString(appFor(ArchiveTimeline, { posts }, true))
  const ssr = document.createElement('div')
  ssr.innerHTML = html
  expect(ssr.querySelectorAll('time')).toHaveLength(4)
  expect([...ssr.querySelectorAll('time')].map(time => time.dateTime)).toEqual(['2026-01-01', '2024-02-29', '2024-02-29', '2023-12-31'])
  const { host } = mount(ArchiveTimeline, { posts })
  const buttons = [...host.querySelectorAll<HTMLButtonElement>('button[aria-expanded]')]
  const states = () => buttons.map(button => button.getAttribute('aria-expanded'))
  expect(host.textContent).toContain('共 4 篇文章 · 3 个年份')
  expect(states()).toEqual(['true', 'false', 'false'])
  buttons[1]!.click()
  await nextTick()
  expect(states()).toEqual(['true', 'true', 'false'])
  const link = host.querySelector<HTMLAnchorElement>('a[href="/posts/a"]')!
  link.focus()
  buttons[1]!.click()
  await nextTick()
  expect(link.closest('[inert]')).not.toBeNull()
  expect(document.activeElement).toBe(buttons[1])
  expect(states()).toEqual(['true', 'false', 'false'])
})

test('分类和标签按文章数降序、名称稳定排序，特殊字符搜索按原文匹配', () => {
  const ordered = rankTerms(terms)
  expect(ordered.map(term => term.name)).toEqual(['100%', 'Vue', 'C#', 'C++'])
  expect(terms[0]!.name).toBe('Vue')
  expect(searchTerms(ordered, ' ＶｕＥ ')).toEqual([{ name: 'Vue', count: 2 }])
  expect(searchTerms(ordered, '#')).toEqual([{ name: 'C#', count: 1 }])
  expect(searchTerms(ordered, '%')).toEqual([{ name: '100%', count: 4 }])
  expect(searchTerms(ordered, '[.*]')).toEqual([])
})

test('标签搜索即时过滤，显示数量、编码链接和无结果状态，清空后恢复并聚焦输入框', async () => {
  const { host } = mount(TaxonomyDirectory, { kind: 'tag', terms })
  const links = () => [...host.querySelectorAll('li a')].map(link => [link.getAttribute('href'), link.getAttribute('aria-label')])
  expect(links()[0]).toEqual(['/tags/100%25', '100%，4 篇文章'])
  const input = host.querySelector('input')!
  const search = async (query: string) => {
    input.value = query
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
  }
  await search('C#')
  expect(links()).toEqual([['/tags/C%23', 'C#，1 篇文章']])
  expect(host.querySelector('[role="status"]')!.textContent).toContain('找到 1 个')
  await search('不存在')
  expect(host.textContent).toContain('没有匹配的标签')
  host.querySelector<HTMLButtonElement>('button[aria-label="清空标签搜索"]')!.click()
  await nextTick()
  expect(input.value).toBe('')
  expect(links()).toHaveLength(4)
  expect(document.activeElement).toBe(input)
})

test.each(['category', 'tag'] as const)('%s 总览展示全部名称与数量，不展示文章', async (kind) => {
  vi.stubGlobal('usePostCatalog', () => ({ data: ref(posts), categories: ref(terms), tags: ref(terms), status: ref('success'), error: ref(null), refresh: vi.fn() }))
  vi.stubGlobal('usePostListActions', vi.fn())
  vi.stubGlobal('useSeoMeta', vi.fn())
  const { host } = mount(TaxonomyIndex, { kind })
  const label = kind === 'category' ? '分类' : '标签'
  expect(host.querySelector('h1')!.textContent).toBe(label)
  expect(host.textContent).toContain(`共 4 个${label}`)
  expect(host.querySelectorAll('li a')).toHaveLength(4)
  for (const post of posts) expect(host.textContent).not.toContain(post.title)
  expect(host.querySelector('article')).toBeNull()
  const prefix = kind === 'category' ? '/categories/' : '/tags/'
  expect(host.querySelector('li a')!.getAttribute('href')).toBe(`${prefix}100%25`)
})

test('目录加载中、加载失败重试和空集合有独立状态，不闪现空态或错误计数', async () => {
  const retry = vi.fn()
  const { host, props } = mount(CatalogStatus, { label: '分类', pending: true, failed: false, empty: true, icon: 'folder', onRetry: retry })
  expect(host.querySelector('[role="status"]')!.textContent).toContain('正在加载分类')
  expect(host.textContent).not.toContain('暂无分类')
  props.value.failed = true
  await nextTick()
  expect(host.querySelector('[role="alert"]')!.textContent).toContain('分类加载失败')
  host.querySelector('button')!.click()
  expect(retry).toHaveBeenCalledOnce()
  props.value.pending = false
  props.value.failed = false
  await nextTick()
  expect(host.textContent).toContain('暂无分类')
})

test('分类导航的主列表与更多菜单不显示文章数，全部文章返回首页', async () => {
  for (const [name, value] of Object.entries({ computed, ref, watch, nextTick, onMounted, useId, useTemplateRef, useResizeObserver: vi.fn(), onClickOutside: vi.fn() })) vi.stubGlobal(name, value)
  const html = await renderToString(appFor(CategoryNavigation, { categories: [{ name: '内容管理', count: 9876 }], selected: '' }, true))
  const host = document.createElement('div')
  host.innerHTML = html
  expect(host.textContent).toContain('内容管理')
  expect(host.textContent).not.toContain('9876')
  expect(host.querySelector('a')!.getAttribute('href')).toBe('/posts')
  expect(host.querySelector('a[aria-current="page"]')!.textContent!.trim()).toBe('全部文章')
})
