// @vitest-environment happy-dom
import type { ArticlePreview } from '../shared/admin/preview'
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import AdminArticlePreview from '../app/components/admin/AdminArticlePreview.vue'
import BaseButton from '../app/components/base/BaseButton.vue'
import BaseCollapsible from '../app/components/base/BaseCollapsible.vue'

afterEach(() => vi.unstubAllGlobals())
const response = (title: string) => ({ data: { title, theme: '#ff7d36', summarySource: 'description' }, body: {}, toc: { links: [] } }) as ArticlePreview
async function settle() {
  await Promise.resolve()
  await nextTick()
  await nextTick()
}

test('打开预览只请求当前未保存源码，关闭后忽略过期响应，失败时可重试', async () => {
  const pending: { resolve: (value: ArticlePreview) => void, reject: (error: Error) => void }[] = []
  const request = vi.fn(() => new Promise<ArticlePreview>((resolve, reject) => pending.push({ resolve, reject })))
  vi.stubGlobal('useAdminSession', () => ({ request }))
  vi.stubGlobal('useColorMode', () => ({ value: 'dark' }))
  vi.stubGlobal('adminError', (error: Error) => error.message)
  const open = ref(false)
  const source = ref('当前未保存的源码')
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({ render: () => h(AdminArticlePreview, { 'modelValue': open.value, 'onUpdate:modelValue': value => open.value = value, 'draftId': 'draft', 'source': source.value, 'summaryText': '未保存摘要' }) })
  app.component('AcrylicDialog', defineComponent({ setup: (_, { slots }) => () => h('div', slots.default?.()) }))
  app.component('BaseButton', BaseButton)
  app.component('AdminSkeleton', defineComponent({ setup: () => () => h('p', 'loading') }))
  app.component('ArticleHeader', defineComponent({ props: ['post'], setup: props => () => h('h1', props.post.title) }))
  for (const name of ['ContentRenderer', 'ArticleBody', 'ArticleSummary', 'ContentToc'])
    app.component(name, defineComponent({ setup: () => () => h('div') }))
  app.mount(host)
  try {
    expect(request).not.toHaveBeenCalled()
    open.value = true
    await settle()
    expect(request).toHaveBeenCalledWith('drafts/draft/preview', { method: 'POST', body: { source: '当前未保存的源码', summaryText: '未保存摘要' } })
    open.value = false
    await settle()
    source.value = '更新后的源码'
    open.value = true
    await settle()
    pending[1]!.resolve(response('本次预览'))
    await settle()
    pending[0]!.resolve(response('过期预览'))
    await settle()
    expect(host.textContent).toContain('本次预览')
    expect(host.textContent).not.toContain('过期预览')
    host.querySelector<HTMLButtonElement>('button')!.click()
    await settle()
    pending[2]!.reject(new Error('解析失败'))
    await settle()
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('解析失败')
    host.querySelector<HTMLButtonElement>('[role="alert"] button')!.click()
    await settle()
    pending[3]!.resolve(response('重试成功'))
    await settle()
    expect(host.textContent).toContain('重试成功')
    expect(host.querySelector('[role="alert"]')).toBeNull()
    expect(request.mock.calls).toHaveLength(4)
    expect(source.value).toBe('更新后的源码')
  }
  finally {
    app.unmount()
    host.remove()
  }
})

test('预览正文锚点先展开内部折叠，只滚动预览容器并聚焦其中的标题', async () => {
  vi.stubGlobal('useAdminSession', () => ({ request: async () => response('折叠预览') }))
  vi.stubGlobal('useColorMode', () => ({ value: 'dark' }))
  const open = ref(false)
  const host = document.createElement('div')
  const outside = document.createElement('h2')
  outside.id = '预览目标'
  document.body.append(outside, host)
  const app = createApp({ render: () => h(AdminArticlePreview, { 'modelValue': open.value, 'onUpdate:modelValue': value => open.value = value, 'draftId': 'draft', 'source': '测试正文' }) })
  const passthrough = defineComponent({ setup: (_, { slots }) => () => h('div', slots.default?.()) })
  app.component('AcrylicDialog', passthrough)
  app.component('ArticleBody', passthrough)
  app.component('BaseButton', BaseButton)
  for (const name of ['AdminSkeleton', 'ArticleHeader', 'ArticleSummary', 'ContentToc'])
    app.component(name, defineComponent({ setup: () => () => h('div') }))
  app.component('ContentRenderer', defineComponent({ setup: () => () => h('div', [
    h('a', { href: `#${encodeURIComponent('预览目标')}` }, '定位'),
    h(BaseCollapsible, {}, {
      trigger: () => h('button', '说明'),
      default: () => h('h2', { id: '预览目标' }, '预览内标题'),
    }),
  ]) }))
  app.mount(host)
  try {
    open.value = true
    await settle()
    const viewport = host.querySelector<HTMLElement>('.preview-scroll')!
    const heading = host.querySelector('h2')!
    const scroll = vi.spyOn(viewport, 'scrollTo').mockImplementation(() => {
      expect(heading.closest('[inert]')).toBeNull()
    })
    host.querySelector('a')!.click()
    for (let index = 0; index < 8; index++) await nextTick()
    expect(scroll).toHaveBeenCalledOnce()
    expect(document.activeElement).toBe(heading)
    expect(document.activeElement).not.toBe(outside)
  }
  finally {
    app.unmount()
    host.remove()
    outside.remove()
  }
})
