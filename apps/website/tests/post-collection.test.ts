// @vitest-environment happy-dom
import type { Component, Ref } from 'vue'
import type { TaxonomyFilter } from '../shared/content/taxonomy'
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { computed, createApp, createSSRApp, defineComponent, h, nextTick, reactive, ref, toValue } from 'vue'
import { createMemoryHistory, createRouter, RouterLink } from 'vue-router'
import { renderToString } from 'vue/server-renderer'
import PostCollection from '../app/components/posts/PostCollection.vue'
import PostPagination from '../app/components/posts/PostPagination.vue'
import { aggregateTerms } from '../shared/content/catalog'
import { postSchema } from '../shared/content/schema'
import { pageUrl } from '../shared/site/url'

const cleanup: (() => void)[] = []
afterEach(() => {
  for (const close of cleanup.splice(0)) close()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const Container = defineComponent({ setup: (_, { slots }) => () => h('div', slots.default?.()) })
function postItem(kind: string) {
  return defineComponent({
    props: ['post'],
    setup: props => () => h('article', { 'data-post': props.post.path, 'data-view': kind }, props.post.title),
  })
}
const components: Record<string, Component> = {
  NuxtLink: RouterLink,
  SiteColumns: Container,
  SiteSidebar: Container,
  TagFilter: Container,
  AppIcon: Container,
  BaseButton: Container,
  ContentEmptyState: Container,
  PostListItem: postItem('list'),
  PostCard: postItem('grid'),
  PostPagination,
}

async function setup(options: { url?: string, count?: number, pending?: boolean, ssr?: boolean } = {}) {
  const posts = Array.from({ length: options.count ?? 21 }, (_, index) => ({
    ...postSchema.parse({ title: `文章 ${index + 1}`, description: '', publish: '2026-09-01', tags: index % 2 ? ['Vue'] : ['CSS'], categories: ['内容管理'] }),
    path: `/posts/${index + 1}`,
  }))
  const data = ref(options.pending ? undefined : posts)
  const status = ref(options.pending ? 'pending' : 'success')
  const error = ref<unknown>()
  const preference = ref('list')
  const filter = ref<TaxonomyFilter>()
  const catalog = { data, status, error, refresh: vi.fn(), tags: computed(() => aggregateTerms(data.value ?? [], 'tags')) }
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: Container }] })
  await router.push(options.url ?? '/posts')
  await router.isReady()
  const route = reactive({
    get path() { return router.currentRoute.value.path },
    get query() { return router.currentRoute.value.query },
    get hash() { return router.currentRoute.value.hash },
  })
  const replace = vi.spyOn(router, 'replace')
  const heads: { link: { href: Ref<string> }[] }[] = []
  const metas: { ogUrl: Ref<string> }[] = []
  vi.stubGlobal('useRoute', () => route)
  vi.stubGlobal('useRouter', () => router)
  vi.stubGlobal('useCookie', () => preference)
  vi.stubGlobal('usePostCatalog', () => catalog)
  vi.stubGlobal('useHead', (head: typeof heads[number]) => heads.push(head))
  vi.stubGlobal('useSeoMeta', (meta: typeof metas[number]) => metas.push(meta))
  vi.stubGlobal('usePageUrl', (path: () => string) => computed(() => pageUrl('https://blog.setobox.me', '/blog/', toValue(path))))
  const scroll = vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => {})
  const app = (options.ssr ? createSSRApp : createApp)({ render: () => h(PostCollection, { filter: filter.value }) })
  app.use(router)
  for (const [name, component] of Object.entries(components)) app.component(name, component)
  const host = document.createElement('div')
  document.body.append(host)
  let mounted = false
  cleanup.push(() => {
    if (mounted)
      app.unmount()
    host.remove()
  })
  async function settle() {
    // Vue Router finishes navigation after promise callbacks and the render tick.
    await new Promise(resolve => setTimeout(resolve, 0))
    await nextTick()
  }
  async function mount() {
    app.mount(host)
    mounted = true
    await settle()
  }
  const titles = () => [...host.querySelectorAll('article')].map(element => element.textContent)
  const canonical = () => heads.at(-1)!.link[0]!.href.value
  return { app, host, mount, settle, titles, canonical, metas, router, replace, data, status, error, preference, filter, posts, scroll }
}

test('真实分页链接翻页、前进后退和视图切换保持一致，主动翻页聚焦列表', async () => {
  const state = await setup()
  await state.mount()
  expect(state.titles()).toHaveLength(10)
  expect(state.host.querySelector('[aria-label="文章列表"] p')?.textContent).toContain('21')
  expect(state.host.querySelector('[aria-label="文章分页"]')?.textContent?.replace(/\s/g, '')).toBe('123')
  expect(state.host.querySelector('[aria-label="文章分页"] [aria-disabled="true"]')?.getAttribute('aria-label')).toBe('上一页')
  const next = state.host.querySelector<HTMLAnchorElement>('a[rel="next"]')!
  expect(next.getAttribute('href')).toBe('/posts?page=2')
  next.click()
  await state.settle()
  expect(state.router.currentRoute.value.query.page).toBe('2')
  expect(state.titles()).toEqual(Array.from({ length: 10 }, (_, index) => `文章 ${index + 11}`))
  expect(document.activeElement?.getAttribute('aria-label')).toBe('文章列表')
  expect(state.scroll).toHaveBeenCalledOnce()
  state.host.querySelector<HTMLButtonElement>('[aria-label="卡片显示"]')!.click()
  await nextTick()
  expect(state.host.querySelectorAll('article[data-view="grid"]')).toHaveLength(10)
  expect(state.router.currentRoute.value.query.page).toBe('2')
  state.router.back()
  await state.settle()
  expect(state.titles()[0]).toBe('文章 1')
  state.router.forward()
  await state.settle()
  expect(state.titles()[0]).toBe('文章 11')
  expect(state.scroll).toHaveBeenCalledOnce()
  state.host.querySelector<HTMLAnchorElement>('a[rel="next"]')!.click()
  await state.settle()
  expect(state.titles()).toEqual(['文章 21'])
  expect(state.host.querySelector('a[rel="next"]')).toBeNull()
  expect(state.host.querySelector('[aria-label="文章分页"] [aria-disabled="true"]')?.getAttribute('aria-label')).toBe('下一页')
  expect(state.host.querySelector('[aria-label="第 3 页"]')?.getAttribute('aria-current')).toBe('page')
  state.host.querySelector<HTMLAnchorElement>('[aria-label="第 1 页"]')!.click()
  await state.settle()
  expect(state.router.currentRoute.value.fullPath).toBe('/posts')
  expect(state.titles()[0]).toBe('文章 1')
})

test('第二页直接访问的服务端 HTML 与 hydration 一致，并具有独立 SEO 地址', async () => {
  const state = await setup({ url: '/posts?page=2&source=test', ssr: true })
  const html = await renderToString(state.app)
  expect(html).toContain('data-post="/posts/11"')
  expect(html).not.toContain('data-post="/posts/1"')
  state.host.innerHTML = html
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  await state.mount()
  expect(state.titles()).toHaveLength(10)
  expect(state.canonical()).toBe('https://blog.setobox.me/blog/posts?page=2')
  expect(state.metas.at(-1)!.ogUrl.value).toBe(state.canonical())
  expect(state.host.querySelector('a[rel="prev"]')?.getAttribute('href')).toBe('/posts?source=test')
  expect(warn).not.toHaveBeenCalled()
  expect(error).not.toHaveBeenCalled()
  expect(state.replace).not.toHaveBeenCalled()
})

test.each(['0', '-2', '2.5', 'abc', '2&page=3', '', '1'])('异常或显式首页 %s 规范为无页码的第一页', async (page) => {
  const state = await setup({ url: `/posts?page=${page}&source=test#heading` })
  await state.mount()
  expect(state.router.currentRoute.value.fullPath).toBe('/posts?source=test#heading')
  expect(state.replace).toHaveBeenCalledOnce()
  expect(state.canonical()).toBe('https://blog.setobox.me/blog/posts')
  expect(state.titles()[0]).toBe('文章 1')
})

test('目录加载完成前不修正页码，成功后将越界页替换为末页；失败不改网址', async () => {
  const state = await setup({ url: '/posts?page=99', pending: true })
  await state.mount()
  expect(state.replace).not.toHaveBeenCalled()
  expect(state.host.querySelector('nav')).toBeNull()
  state.status.value = 'error'
  state.error.value = new Error('读取失败')
  await state.settle()
  expect(state.replace).not.toHaveBeenCalled()
  expect(state.host.querySelector('[role="alert"]')?.textContent).toContain('文章加载失败')
  state.data.value = state.posts
  state.error.value = undefined
  state.status.value = 'success'
  await state.settle()
  expect(state.router.currentRoute.value.fullPath).toBe('/posts?page=3')
  expect(state.titles()).toEqual(['文章 21'])
  expect(state.replace).toHaveBeenCalledOnce()
})

test.each([0, 1, 10])('%i 篇文章不显示分页控件', async (count) => {
  const state = await setup({ count })
  await state.mount()
  expect(state.titles()).toHaveLength(count)
  expect(state.host.querySelector('[aria-label="文章分页"]')).toBeNull()
})

test('标签与专栏在筛选后计算页数，切换路径回首页，查询参数不覆盖筛选', async () => {
  const state = await setup({ url: '/tags/C%23?page=2', count: 24 })
  state.filter.value = { kind: 'tag', name: 'Vue' }
  await state.mount()
  expect(state.titles()).toEqual(['文章 22', '文章 24'])
  expect(state.host.querySelector('[aria-label="文章列表"] p')?.textContent).toContain('12')
  expect(state.host.querySelector('a[rel="prev"]')?.getAttribute('href')).toBe('/tags/C%23')
  state.filter.value = { kind: 'category', name: '内容管理' }
  await state.router.push('/categories/%E5%86%85%E5%AE%B9%E7%AE%A1%E7%90%86?tag=old')
  await state.settle()
  expect(state.titles()[0]).toBe('文章 1')
  expect(state.host.querySelector('[aria-label="文章列表"] p')?.textContent).toContain('24')
  expect(state.host.querySelector('a[rel="next"]')?.getAttribute('href')).toBe('/categories/%E5%86%85%E5%AE%B9%E7%AE%A1%E7%90%86?tag=old&page=2')
})

test.each(['/categories', '/tags/C%23', '/tags/%2523', '/tags/C%2B%2B', '/categories/%E5%BC%80%E5%8F%91'])('分页保留路径编码：%s', async (path) => {
  const state = await setup({ url: `${path}?page=2` })
  await state.mount()
  expect(state.host.querySelector('a[rel="next"]')?.getAttribute('href')).toBe(`${path}?page=3`)
  expect(state.canonical()).toBe(`https://blog.setobox.me/blog${path}?page=2`)
})

test('修饰键打开分页链接不触发当前页面滚动或聚焦', async () => {
  const state = await setup()
  await state.mount()
  state.host.querySelector('a[rel="next"]')!.dispatchEvent(new MouseEvent('click', { ctrlKey: true, button: 0, bubbles: true, cancelable: true }))
  await state.settle()
  expect(state.router.currentRoute.value.fullPath).toBe('/posts')
  expect(state.scroll).not.toHaveBeenCalled()
})
