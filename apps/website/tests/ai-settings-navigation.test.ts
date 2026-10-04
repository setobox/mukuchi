// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { computed, createApp, defineComponent, h, nextTick, reactive } from 'vue'
import AiPage from '../app/pages/admin/ai.vue'

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach(fn => fn())
  vi.unstubAllGlobals()
})
async function flush() {
  for (let i = 0; i < 15; i++) await nextTick()
}
function mount(query: Record<string, string>) {
  const route = reactive({ query })
  const replace = vi.fn(({ query }: { query: Record<string, string> }) => route.query = query)
  for (const [name, value] of Object.entries({ computed, definePageMeta: vi.fn(), useSeoMeta: vi.fn(), useRoute: () => route, useRouter: () => ({ replace }) })) vi.stubGlobal(name, value)
  const host = document.createElement('div')
  const app = createApp(AiPage)
  const panel = defineComponent({
    props: ['view', 'active', 'kind'],
    emits: ['update:view'],
    setup: (props, { emit }) => () => h('div', { 'data-view': props.view, 'data-active': props.active }, [h('input'), h('button', { onClick: () => emit('update:view', props.view === 'config' ? 'tasks' : 'config') }, '切换视图')]),
  })
  for (const name of ['SummarySettings', 'AudioSettings', 'AssistantSettings']) app.component(name, panel)
  app.mount(host)
  cleanups.push(() => app.unmount())
  return { host, route, replace }
}
test.each([
  [{ tab: 'assistant' }, 'config'],
  [{ tab: 'narration', article: 'posts/example' }, 'tasks'],
  [{ tab: 'summary', view: 'config', article: 'posts/example' }, 'config'],
  [{ tab: 'assistant', view: 'tasks' }, 'tasks'],
])('链接 %j 使用正确的内部视图', async (query, expected) => {
  const { host } = mount(query)
  await flush()
  expect(host.querySelector('[data-active=true]')?.getAttribute('data-view')).toBe(expected)
})
test('切换同步路由并保留文章定位参数，各功能表单始终挂载', async () => {
  const { host, route } = mount({ tab: 'summary', article: 'posts/example' })
  await flush()
  const original = host.querySelectorAll('input')
  host.querySelector<HTMLButtonElement>('[data-active=true] button')!.click()
  await flush()
  expect(route.query).toEqual({ tab: 'summary', article: 'posts/example', view: 'config' })
  const assistant = [...host.querySelectorAll('[role=tab]')].find(tab => tab.textContent?.includes('对话助手'))!
  assistant.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  await flush()
  expect(route.query.tab).toBe('assistant')
  expect(host.querySelectorAll('input')).toHaveLength(3)
  expect(host.querySelectorAll('input')[0]).toBe(original[0])
  expect(host.querySelectorAll('input')[2]).toBe(original[2])
})
