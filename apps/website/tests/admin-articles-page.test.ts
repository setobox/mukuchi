// @vitest-environment happy-dom
import type { AdminArticleRow } from '../shared/admin/articles'
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { computed, createApp, defineComponent, h, nextTick, ref, shallowRef, watch } from 'vue'
import BaseButton from '../app/components/base/BaseButton.vue'
import ArticlesPage from '../app/pages/admin/index.vue'

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup())
  vi.unstubAllGlobals()
})
async function settle() {
  for (let index = 0; index < 6; index++) await nextTick()
}
function row(index: number): AdminArticleRow {
  return {
    path: `notes/${index}.md`,
    title: `文章 ${index}`,
    route: `/posts/notes/${index}`,
    publish: '2026-10-13',
    update: '',
    editedAt: '',
    sortAt: '2026-10-13',
    draft: null,
    publication: { published: true, hasPublished: true, hasChanges: false },
    audioSourceChanged: false,
    ai: { summary: { status: 'missing', record: null, message: '' }, narration: { status: 'missing', message: '' }, podcast: { status: 'missing', message: '' } },
  }
}
function mount(rows = Array.from({ length: 25 }, (_, index) => row(index))) {
  for (const [name, value] of Object.entries({ computed, ref, shallowRef, watch })) vi.stubGlobal(name, value)
  vi.stubGlobal('definePageMeta', vi.fn())
  vi.stubGlobal('useSeoMeta', vi.fn())
  vi.stubGlobal('adminError', () => '请求失败')
  const navigate = vi.fn()
  vi.stubGlobal('navigateTo', navigate)
  const request = vi.fn(async (_path: string, _options?: object): Promise<unknown> => ({ rows }))
  vi.stubGlobal('useAdminSession', () => ({ current: ref({ user: { role: 'admin' } }), request }))
  const renderTag = vi.fn()
  const renderSelect = vi.fn()
  const app = createApp(ArticlesPage)
  app.component('BaseButton', BaseButton)
  app.component('BaseSelect', defineComponent({ props: ['options', 'modelValue'], emits: ['update:modelValue'], setup: (props, { emit }) => () => {
    renderSelect(props.options, props.modelValue)
    return h('select', {
      value: props.modelValue,
      onChange: (event: Event) => emit('update:modelValue', (event.target as HTMLSelectElement).value),
    }, props.options.map((option: { value: string, label: string }) => h('option', { value: option.value }, option.label)))
  } }))
  app.component('BaseTag', defineComponent({ setup: (_, { slots }) => () => h('span', slots.default?.()) }))
  app.component('AdminSkeleton', defineComponent({ render: () => h('span', '读取中') }))
  app.component('AdminAiTag', defineComponent({ props: ['kind', 'path', 'state'], setup: props => () => {
    renderTag(props.path, props.kind)
    return h('span', props.state.status)
  } }))
  const host = document.createElement('div')
  app.mount(host)
  cleanups.push(() => app.unmount())
  const input = host.querySelector<HTMLInputElement>('[aria-label="搜索文章"]')!
  const button = (text: string) => [...host.querySelectorAll('button')].find(button => button.textContent?.trim() === text)!
  async function search(query: string) {
    input.value = query
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await settle()
  }
  return { host, request, renderTag, renderSelect, search, button, navigate }
}

test('搜索仅在本地过滤，保留结果不重复渲染 AI 标签，路径、翻页与清空搜索保持正确', async () => {
  const { host, request, renderTag, renderSelect, search, button } = mount()
  await settle()
  expect(request).toHaveBeenCalledExactlyOnceWith('articles?view=rows')
  expect(host.querySelectorAll('article')).toHaveLength(20)
  expect(renderTag).toHaveBeenCalledTimes(60)
  renderSelect.mockClear()
  await search('文章')
  await search(' 文章 ')
  expect(renderTag).toHaveBeenCalledTimes(60)
  expect(renderSelect).not.toHaveBeenCalled()
  expect(request).toHaveBeenCalledTimes(1)
  button('下一页').click()
  await settle()
  expect(host.querySelectorAll('article')).toHaveLength(5)
  await search('NOTES/24.MD')
  expect(host.querySelectorAll('article')).toHaveLength(1)
  expect(host.querySelector('article')?.textContent).toContain('文章 24')
  expect(host.textContent).toContain('1 / 1')
  await search('无匹配结果')
  expect(host.textContent).toContain('没有匹配的文章')
  await search('')
  expect(host.querySelectorAll('article')).toHaveLength(20)
  expect(request).toHaveBeenCalledTimes(1)
})

test('搜索与发布、AI 状态筛选组合使用时结果及时更新，不重新请求列表', async () => {
  const draft = { ...row(0), publication: { published: false, hasPublished: false, hasChanges: true } }
  const published = row(1)
  published.ai.narration.status = 'failed'
  const { host, request, search } = mount([draft, published, row(2)])
  await settle()
  async function select(label: string, value: string) {
    const input = host.querySelector<HTMLSelectElement>(`[aria-label="${label}"]`)!
    input.value = value
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await settle()
  }
  await search('文章')
  await select('文章状态', 'drafts')
  expect(host.querySelectorAll('article')).toHaveLength(1)
  expect(host.querySelector('article')?.textContent).toContain('文章 0')
  await select('文章状态', 'published')
  expect(host.querySelectorAll('article')).toHaveLength(2)
  await select('AI 类型', 'narration')
  await select('AI 状态', 'failed')
  expect(host.querySelectorAll('article')).toHaveLength(1)
  expect(host.querySelector('article')?.textContent).toContain('文章 1')
  await select('AI 类型', 'summary')
  expect(host.querySelectorAll('article')).toHaveLength(0)
  await select('AI 类型', 'all')
  expect(host.querySelectorAll('article')).toHaveLength(1)
  expect(request).toHaveBeenCalledTimes(1)
})

test('行复用后编辑按钮仍响应忙碌状态，刷新会替换标题和 AI 状态', async () => {
  const { host, request, button, navigate } = mount()
  await settle()
  let finish!: (value: unknown) => void
  request.mockImplementationOnce(() => new Promise((resolve) => {
    finish = resolve
  }))
  button('文章 0').click()
  await settle()
  expect(button('文章 0').disabled).toBe(true)
  expect(button('文章 1').disabled).toBe(false)
  finish({ id: 'draft-id' })
  await settle()
  expect(navigate).toHaveBeenCalledWith('/admin/editor/draft-id')
  expect(button('文章 0').disabled).toBe(false)
  const updated = row(0)
  updated.title = '更新标题'
  updated.ai.narration.status = 'public'
  request.mockResolvedValueOnce({ rows: [updated] })
  button('刷新').click()
  await settle()
  expect(host.querySelectorAll('article')).toHaveLength(1)
  expect(host.querySelector('article')?.textContent).toContain('更新标题')
  expect(host.querySelector('article')?.textContent).toContain('public')
})
