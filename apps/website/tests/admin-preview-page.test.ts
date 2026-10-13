// @vitest-environment happy-dom
import type { ArticlePreviewContext } from '../shared/admin/preview'
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { computed, createApp, defineComponent, h, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, useTemplateRef, watch, watchEffect } from 'vue'
import ArticlePage from '../app/components/posts/ArticlePage.vue'
import PreviewPage from '../app/pages/admin/preview/[id].vue'
import { prepareArticlePreview } from '../server/features/admin/preview'

vi.mock('../app/features/admin/preview-client', () => ({
  renderClientPreview: async (_source: string, context: ArticlePreviewContext) => ({ data: context.data, body: { type: 'root', children: [] }, toc: { links: [] } }),
}))
const draftId = '008126e7-b55d-4df0-982c-011e0dfd11b1'
const editorSession = 'ab88439f-7435-45d3-aa4b-dbb114f0f451'
const source = '---\ntitle: 预览正文\ndescription: 简介\npublish: 2026-10-12\nseries: 测试系列\n---\n\n## 正文\n'
const context = prepareArticlePreview(source, 'preview.md', [], '', { status: 'missing', record: null, message: '' })
const passthrough = defineComponent({ setup: (_, { slots }) => () => h('div', [slots.default?.(), slots.sidebar?.(), slots['after-profile']?.()]) })
const cleanups: (() => void)[] = []
async function settle() {
  for (let index = 0; index < 12; index++) await nextTick()
}
function globals() {
  for (const [name, value] of Object.entries({ computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, useTemplateRef, watch, watchEffect }))
    vi.stubGlobal(name, value)
  vi.stubGlobal('definePageMeta', vi.fn())
  vi.stubGlobal('useSeoMeta', vi.fn())
  vi.stubGlobal('useHead', vi.fn())
  vi.stubGlobal('useRoute', () => ({ path: `/admin/preview/${draftId}`, params: { id: draftId }, query: { session: editorSession } }))
  vi.stubGlobal('usePageUrl', (path: () => string) => computed(() => `https://blog.test${path()}`))
  vi.stubGlobal('useActionButton', vi.fn())
  vi.stubGlobal('adminError', () => '请求失败')
}
afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup())
  vi.unstubAllGlobals()
  sessionStorage.clear()
})

test('预览页先鉴权再接收源码，使用轻量接口；退出账号立即移除文章和快照', async () => {
  globals()
  const current = ref<{ user: { id: string, role: string } | null, localAvailable: boolean, ssoAvailable: boolean }>({ user: { id: 'owner', role: 'admin' }, localAvailable: false, ssoAvailable: true })
  let authorize!: (value: boolean) => void
  const refresh = vi.fn(() => new Promise<boolean>((resolve) => {
    authorize = resolve
  }))
  const request = vi.fn(async () => context)
  vi.stubGlobal('useAdminSession', () => ({ current, refresh, request, localLogin: vi.fn(), loginOpen: ref(false) }))
  const channels: { name: string, receive?: (event: MessageEvent<unknown>) => void, close: ReturnType<typeof vi.fn> }[] = []
  vi.stubGlobal('BroadcastChannel', class {
    close = vi.fn()
    receive?: (event: MessageEvent<unknown>) => void
    constructor(readonly name: string) { channels.push(this) }
    postMessage() {}
    addEventListener(_name: string, receive: (event: MessageEvent<unknown>) => void) { this.receive = receive }
    removeEventListener() { this.receive = undefined }
  })
  const app = createApp(PreviewPage)
  app.component('ArticlePage', defineComponent({ props: ['post'], setup: props => () => h('h1', props.post.title) }))
  app.component('NuxtLink', passthrough)
  app.component('AdminSkeleton', passthrough)
  const host = document.createElement('div')
  app.mount(host)
  cleanups.push(() => app.unmount())
  expect(channels).toHaveLength(0)
  expect(request).not.toHaveBeenCalled()
  authorize(true)
  await settle()
  expect(channels).toHaveLength(1)
  channels[0]!.receive?.({ data: { type: 'snapshot', snapshot: { version: 1, source, summaryText: '未保存摘要' } } } as MessageEvent<unknown>)
  await settle()
  expect(request).toHaveBeenCalledExactlyOnceWith(`drafts/${draftId}/preview`, { method: 'POST', body: { source, summaryText: '未保存摘要' } })
  expect(host.querySelector('h1')?.textContent).toBe('预览正文')
  expect(sessionStorage.getItem(channels[0]!.name)).toContain('未保存摘要')
  current.value.user = null
  await settle()
  expect(host.querySelector('h1')).toBeNull()
  expect(channels[0]!.close).toHaveBeenCalledOnce()
  expect(sessionStorage.getItem(channels[0]!.name)).toBeNull()
})

test('共享文章页使用正式文章路径显示阅读、音频、系列、评论与版权，主题绑定当前预览路由', () => {
  globals()
  const theme = vi.fn()
  vi.stubGlobal('useArticleTheme', theme)
  vi.stubGlobal('useElementSize', () => ({ height: ref(0) }))
  vi.stubGlobal('usePostCatalog', () => ({ tags: ref([]) }))
  vi.stubGlobal('useState', (_key: string, factory: () => unknown) => ref(factory()))
  vi.stubGlobal('useScrollToTop', () => ({ isScrolled: ref(false), scrollToTop: vi.fn() }))
  const post = { ...context.data, body: { type: 'root' as const, children: [] } }
  const app = createApp({ render: () => h(ArticlePage, { post, links: [], contentKey: 'preview:1' }) })
  for (const name of ['SiteColumns', 'SiteSidebar', 'ClientOnly', 'ArticleBody', 'NuxtLink'])
    app.component(name, passthrough)
  for (const name of ['ArticleHeader', 'ArticleAudio', 'ArticleSeries', 'LazyArticleComments', 'ArticleLicense']) {
    app.component(name, defineComponent({
      props: ['post', 'path', 'currentPath', 'permalink', 'preview'],
      setup: props => () => h('div', { 'data-component': name, 'data-path': props.post?.path ?? props.path ?? props.currentPath ?? props.permalink, 'data-preview': props.preview ?? 'false' }),
    }))
  }
  for (const name of ['ContentToc', 'ArticleSummary', 'ContentRenderer', 'AppIcon'])
    app.component(name, defineComponent({ render: () => h('span') }))
  const host = document.createElement('div')
  app.mount(host)
  cleanups.push(() => app.unmount())
  for (const name of ['ArticleHeader', 'ArticleAudio', 'ArticleSeries', 'LazyArticleComments'])
    expect(host.querySelector(`[data-component="${name}"]`)?.getAttribute('data-path')).toBe('/posts/preview')
  expect(host.querySelector('[data-component="ArticleHeader"]')?.getAttribute('data-preview')).toBe('false')
  expect(host.querySelector('[data-component="ArticleLicense"]')?.getAttribute('data-path')).toBe('https://blog.test/posts/preview')
  expect(theme).toHaveBeenCalledWith(`/admin/preview/${draftId}`, expect.any(Function))
})
