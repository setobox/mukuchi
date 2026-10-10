// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { createApp, effectScope, h, nextTick } from 'vue'
import AssistantHtml from '../app/components/assistant/AssistantHtml.vue'
import AssistantMessage from '../app/components/assistant/AssistantMessage.vue'
import { safeMarkdown } from '../app/features/assistant/markdown'
import { useAssistantMotion } from '../app/features/assistant/motion'
import { showcaseMessage } from '../app/features/assistant/showcase'
import { cleanAssistantHtml } from '../shared/assistant/html'
import { assistantMessageSchema } from '../shared/assistant/model'
import { articleImageSchema } from '../shared/assistant/paths'

const cleanup: (() => void)[] = []
afterEach(() => {
  for (const run of cleanup.splice(0)) run()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
async function mount(component: Parameters<typeof createApp>[0], props: Record<string, unknown>) {
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp(component, props)
  app.component('NuxtLink', { props: ['to'], setup: (props, { slots }) => () => h('a', { href: String(props.to) }, slots.default?.()) })
  app.mount(host)
  cleanup.push(() => {
    app.unmount()
    host.remove()
  })
  await nextTick()
  return host
}

test('全部新旧展示样例符合协议并渲染为语义内容，追问只触发填入事件', async () => {
  const message = assistantMessageSchema.parse(showcaseMessage())
  const onSuggestion = vi.fn()
  const host = await mount(AssistantMessage, { message, onSuggestion })
  expect(host.querySelectorAll('.assistant-message-block')).toHaveLength(11)
  expect(host.querySelectorAll('table')).toHaveLength(1)
  expect(host.querySelector('blockquote')?.textContent).toContain('本地样例')
  expect(host.querySelector('iframe')?.getAttribute('sandbox')).toBe('allow-same-origin')
  const button = [...host.querySelectorAll('button')].find(button => button.textContent?.includes('这几个模块如何协作'))!
  button.click()
  expect(onSuggestion).toHaveBeenCalledExactlyOnceWith('这几个模块如何协作？')
})

test('来源鼠标悬停再点击保持打开，键盘可进入链接并用 Escape 关闭', async () => {
  const host = await mount(AssistantMessage, { message: showcaseMessage(2) })
  const trigger = host.querySelector<HTMLButtonElement>('[aria-label="查看本段来源"]')!
  trigger.dispatchEvent(new MouseEvent('mouseenter'))
  await nextTick()
  trigger.click()
  await vi.waitFor(() => expect(trigger.getAttribute('aria-expanded')).toBe('true'))
  await vi.waitFor(() => expect(document.querySelector('.assistant-source-popover')).not.toBeNull())
  const link = document.querySelector<HTMLAnchorElement>('.assistant-source-link')!
  expect(link.href).toContain('/posts/2026/cordis#architecture')
  expect(link.textContent).toContain('运行时与工作流')
  link.focus()
  link.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await vi.waitFor(() => expect(trigger.getAttribute('aria-expanded')).toBe('false'))
  trigger.click()
  await vi.waitFor(() => expect(trigger.getAttribute('aria-expanded')).toBe('true'))
})

test('HTML 白名单移除脚本、导航、表单、事件与网络资源，CSS 独立约束', async () => {
  const clean = cleanAssistantHtml('<div class="tile" onclick="bad()" style="color:red"><p>可见内容</p><script>secret()</script><iframe src="/admin"></iframe><a href="javascript:bad()">链接文字</a><form action="/send"><input value="x"></form><img src="https://bad.example/a"></div>', '.tile{padding:12px}')
  expect(clean.html).toBe('<div class="tile"><p>可见内容</p>链接文字</div>')
  for (const css of ['@import "x";', 'p{background:url(/x)}', 'p{color:red}</style><script>bad()</script>', 'p{background:u\\72l(/x)}'])
    expect(() => cleanAssistantHtml('<p>内容</p>', css)).toThrow()
  expect(() => cleanAssistantHtml('中'.repeat(4097), '')).toThrow('大小限制')
  for (const image of ['/images/%2e%2e/admin', '/images/%', 'https://example.com/x'])
    expect(articleImageSchema.safeParse(image).success).toBe(false)
  const block = { type: 'html', title: '隔离展示', summary: '文字替代', sourceIds: [], ...clean }
  const host = await mount(AssistantHtml, { block })
  const frame = host.querySelector('iframe')!
  expect(frame.getAttribute('sandbox')).toBe('allow-same-origin')
  expect(frame.srcdoc).toContain('script-src \'none\'')
  expect(frame.srcdoc).toContain('default-src \'none\'')
  expect(frame.srcdoc).not.toContain('<script')
  const fallback = await mount(AssistantHtml, { block: { ...block, css: '@import "x"' } })
  expect(fallback.querySelector('iframe')).toBeNull()
  expect(fallback.textContent).toContain('文字替代')
})

test('Markdown 保留标题、列表、引用、代码和表格，正文 HTML 仍是文字', () => {
  const value = safeMarkdown('# 一级\n\n1. 有序\n2. 列表\n\n> 引用\n\n| 名称 | 值 |\n| --- | --- |\n| A | B |\n\n```html\n<script>bad()</script>\n```')
  expect(value.map(block => block.type)).toEqual(['heading', 'list', 'quote', 'table', 'code'])
  expect(value.at(-1)?.lines[0]?.[0]?.text).toBe('<script>bad()</script>')
})

test('减少动态效果时跳过 GSAP 位移且立即完成进入', async () => {
  vi.spyOn(window, 'matchMedia').mockImplementation(query => ({ matches: true, media: query, onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: () => true }))
  const scope = effectScope()
  const motion = scope.run(useAssistantMotion)!
  const element = document.createElement('div')
  document.body.append(element)
  const done = vi.fn()
  await motion.enter(element, done)
  expect(done).toHaveBeenCalledOnce()
  expect(element.style.transform).toBe('')
  expect(element.style.opacity).toBe('')
  scope.stop()
  element.remove()
})
