// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { createApp, h, nextTick, ref } from 'vue'
import AssistantLiveTest from '../app/components/assistant/AssistantLiveTest.vue'

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
async function setup(admin = true) {
  const auth = { current: ref({ user: admin ? { role: 'admin' } : null, localAvailable: false }), busy: ref(false), error: ref(''), refresh: vi.fn(), localLogin: vi.fn() }
  vi.stubGlobal('useAuthSession', () => auth)
  vi.stubGlobal('useRuntimeConfig', () => ({ app: { baseURL: '/' } }))
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    if (String(url).endsWith('/session'))
      return Response.json({ model: 'mock-model', session: { enabled: true, namespace: 'admin-preview:fixture', csrf: 'csrf-fixture', authenticated: true, turnstileSiteKey: '', remaining: 0, inputLimit: 500 } })
    const body = JSON.parse(String(init?.body))
    return Response.json({ kind: 'completed', contextLimited: false, record: { id: body.requestId, conversationId: body.conversationId, user: body.text, createdAt: Date.now(), proof: 'fixture', durationMs: 82_000, assistant: { id: crypto.randomUUID(), role: 'assistant', blocks: [{ type: 'text', text: '测试回答' }], references: [], suggestions: ['展开说明？'] } } })
  })
  vi.stubGlobal('fetch', fetcher)
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp(AssistantLiveTest, { theme: 'dark' })
  app.component('NuxtLink', { props: ['to'], setup: (props, { slots }) => () => h('a', { href: String(props.to) }, slots.default?.()) })
  app.mount(host)
  cleanups.push(() => {
    app.unmount()
    host.remove()
  })
  await vi.waitFor(() => expect(auth.refresh).toHaveBeenCalled())
  return { host, fetcher, auth }
}

test('非管理员只看到登录入口，不读取模型或发送测试请求', async () => {
  const { host, fetcher } = await setup(false)
  expect(host.textContent).toContain('请先登录管理员账号')
  expect(host.querySelector('textarea')).toBeNull()
  expect(fetcher).not.toHaveBeenCalled()
})

test('真实测试界面使用 mock 传输验证发送、免配额、建议填入与本页历史', async () => {
  const { host, fetcher } = await setup()
  await vi.waitFor(() => expect(host.textContent).toContain('mock-model'))
  const input = host.querySelector('textarea')!
  await vi.waitFor(() => expect(input.disabled).toBe(false))
  input.value = '介绍本站'
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await nextTick()
  host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await vi.waitFor(() => expect(host.textContent).toContain('测试回答'))
  expect(host.textContent).toContain('用时 1分22秒')
  const call = fetcher.mock.calls.find(([url]) => String(url).endsWith('/turns'))!
  expect(call[0]).toBe('/api/admin/assistant/preview/turns')
  expect(call[1]).toMatchObject({ headers: { 'accept': 'text/event-stream', 'x-csrf-token': 'csrf-fixture' } })
  expect(JSON.parse(String(call[1]?.body))).toMatchObject({ text: '介绍本站', history: [] })
  const suggestion = [...host.querySelectorAll('button')].find(button => button.textContent?.includes('展开说明'))!
  suggestion.click()
  await nextTick()
  expect(input.value).toBe('展开说明？')
  expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith('/turns'))).toHaveLength(1)
  const clear = [...host.querySelectorAll('button')].find(button => button.textContent?.includes('清空测试对话'))!
  clear.click()
  await vi.waitFor(() => expect(host.textContent).not.toContain('测试回答'))
})
