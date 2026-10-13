// @vitest-environment happy-dom
import type { ActionButton } from '../app/composables/useActionButton'
import { readFileSync } from 'node:fs'
import { URL as NodeURL } from 'node:url'
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { computed, createApp, h, nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'
import { compileStyle, parse } from 'vue/compiler-sfc'
import AssistantPanel from '../app/components/assistant/AssistantPanel.vue'
import { createAssistantController } from '../app/features/assistant/controller'
import { createLocalHistory } from '../app/features/assistant/history'
import { memoryHistoryDatabase } from '../app/features/assistant/storage'

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
async function flush() {
  for (let i = 0; i < 5; i++) await nextTick()
}
async function setup() {
  const controller = createAssistantController({
    history: Promise.resolve(createLocalHistory(memoryHistoryDatabase())),
    transport: {
      session: async () => ({ enabled: true, authenticated: true, namespace: 'account:test', csrf: 'test', turnstileSiteKey: '', remaining: 50, inputLimit: 500 }),
      post: vi.fn(),
    },
    navigate: vi.fn(),
  })
  const registerAction = vi.fn((action: ActionButton) => action)
  for (const [key, value] of Object.entries({ computed, nextTick, onBeforeUnmount, ref, useTemplateRef, watch, useRoute: () => ({ fullPath: '/posts' }), useAuthSession: () => ({ current: ref({ ssoAvailable: true }), loginOpen: ref(false), loginUrl: () => '/login' }), useAssistant: () => controller, useActionButton: registerAction })) vi.stubGlobal(key, value)
  const host = document.createElement('div')
  const trigger = document.createElement('button')
  document.body.append(trigger, host)
  const app = createApp(AssistantPanel)
  app.component('NuxtLink', { props: ['to'], setup: (props, { slots }) => () => h('a', { href: String(props.to) }, slots.default?.()) })
  app.component('AssistantText', { props: ['text'], setup: props => () => h('span', String(props.text)) })
  app.component('AssistantChallenge', { render: () => null })
  const close = vi.spyOn(controller, 'close')
  app.mount(host)
  const dialog = host.querySelector<HTMLDialogElement>('dialog')!
  vi.spyOn(dialog, 'showModal').mockImplementation(() => {
    dialog.open = true
  })
  vi.spyOn(dialog, 'show').mockImplementation(() => {
    dialog.open = true
  })
  vi.spyOn(dialog, 'close').mockImplementation(() => {
    dialog.open = false
  })
  cleanups.push(() => {
    app.unmount()
    controller.dispose()
    host.remove()
    trigger.remove()
  })
  await controller.refreshSession()
  trigger.focus()
  await controller.open()
  await flush()
  const query = (selector: string) => {
    const element = host.querySelector<HTMLElement>(selector)
    expect(element).not.toBeNull()
    return element!
  }
  const pointerdown = (element: HTMLElement, button = 0) => element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button }))
  const click = async (element: HTMLElement) => {
    pointerdown(element)
    element.click()
    await flush()
  }
  function seedReply() {
    const id = crypto.randomUUID()
    const conversationId = controller.currentId.value
    const createdAt = Date.now()
    controller.turns.value = [{ id, conversationId, namespace: 'account:test', createdAt, user: '测试问题', page: { path: null }, status: 'completed', record: { id, conversationId, createdAt, user: '测试问题', proof: 'test', assistant: { id: crypto.randomUUID(), role: 'assistant', blocks: [{ type: 'text', text: '测试回答' }], references: [] } } }]
  }
  return { controller, close, dialog, trigger, query, pointerdown, click, seedReply, registerAction }
}

test('全屏空白遮罩点击关闭，恢复入口焦点并保留草稿和消息', async () => {
  const ui = await setup()
  expect(ui.registerAction.mock.calls[0]![0].label.trim()).not.toBe('')
  for (const selector of ['dialog', '.assistant-shell', '.assistant-header', '.assistant-workspace', '.assistant-main', '.assistant-conversation', '.assistant-turn']) {
    await ui.controller.open()
    ui.controller.draft.value = '尚未发送的草稿'
    ui.seedReply()
    await flush()
    const turn = ui.controller.turns.value[0]
    await ui.click(ui.query(selector))
    expect(ui.dialog.open).toBe(false)
    expect(ui.controller.mode.value).toBe('hidden')
    expect(ui.controller.draft.value).toBe('尚未发送的草稿')
    expect(ui.controller.turns.value[0]).toBe(turn)
    expect(document.activeElement).toBe(ui.trigger)
  }
})

test('消息、输入区域与快捷按钮不关闭；拖选和触摸取消不会误关', async () => {
  const ui = await setup()
  await ui.click(ui.query('.assistant-welcome h3'))
  await ui.click(ui.query('.assistant-suggestion'))
  expect(ui.controller.draft.value).toBe('如何订阅博客更新？')
  ui.seedReply()
  ui.controller.page.value = { path: '/posts/test' }
  await flush()
  for (const selector of ['.assistant-user', '.assistant-reply', '.assistant-reply p', '.assistant-composer', 'input', '.assistant-context']) await ui.click(ui.query(selector))
  const backdrop = ui.query('.assistant-conversation')
  ui.pointerdown(ui.query('.assistant-user'))
  backdrop.click()
  await flush()
  ui.pointerdown(backdrop)
  ui.query('input').click()
  ui.pointerdown(backdrop)
  backdrop.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true }))
  backdrop.click()
  ui.pointerdown(backdrop, 2)
  backdrop.click()
  await flush()
  expect(ui.close).not.toHaveBeenCalled()
  expect(ui.dialog.open).toBe(true)
})

test('遮罩优先关闭抽屉，浮窗空白不关闭助手', async () => {
  const ui = await setup()
  await ui.click(ui.query('[aria-label="会话列表"]'))
  expect(ui.controller.drawer.value).toBe(true)
  await ui.click(ui.query('.assistant-drawer-backdrop'))
  expect(ui.controller.drawer.value).toBe(false)
  expect(ui.close).not.toHaveBeenCalled()
  await ui.click(ui.query('[aria-label="会话列表"]'))
  await ui.click(ui.query('.assistant-header'))
  expect(ui.controller.drawer.value).toBe(false)
  expect(ui.dialog.open).toBe(true)
  await ui.click(ui.query('[aria-label="缩小"]'))
  await ui.click(ui.query('.assistant-conversation'))
  expect(ui.controller.mode.value).toBe('floating')
  expect(ui.close).not.toHaveBeenCalled()
})

test('流式增长时保持向上阅读位置，点击新回复提示后恢复跟随', async () => {
  const ui = await setup()
  ui.seedReply()
  await flush()
  const list = ui.dialog
  Object.defineProperties(list, { scrollHeight: { configurable: true, value: 2000 }, clientHeight: { configurable: true, value: 500 } })
  list.scrollTop = 400
  list.dispatchEvent(new Event('scroll'))
  ui.controller.previews.value = { fixture: { label: '正在生成回复…', message: { id: crypto.randomUUID(), role: 'assistant', blocks: [{ type: 'text', text: '增加内容' }], references: [] } } }
  await flush()
  expect(list.scrollTop).toBe(400)
  await ui.click(ui.query('.assistant-new-reply'))
  expect(list.scrollTop).toBe(2000)
  ui.controller.previews.value = {}
  Object.defineProperty(list, 'scrollHeight', { configurable: true, value: 2300 })
  await flush()
  expect(list.scrollTop).toBe(2300)
})

test('输入法确认与 Shift+Enter 不提交，Enter 单次提交；Ctrl/Cmd+I 打开全屏并聚焦共享草稿', async () => {
  const ui = await setup()
  const send = vi.spyOn(ui.controller, 'send').mockResolvedValue()
  ui.controller.draft.value = '待发送草稿'
  await flush()
  const input = ui.query('input')
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true }))
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true }))
  await flush()
  expect(send).not.toHaveBeenCalled()
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  await flush()
  expect(send).toHaveBeenCalledOnce()
  expect(input.getAttribute('maxlength')).toBeNull()
  expect(input.getAttribute('placeholder')).toBe('问点什么？')
  for (const modifier of ['ctrlKey', 'metaKey']) {
    ui.controller.close()
    await flush()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'i', [modifier]: true, bubbles: true, cancelable: true }))
    await flush()
    expect(ui.controller.mode.value).toBe('fullscreen')
    expect(ui.controller.draft.value).toBe('待发送草稿')
    expect(document.activeElement).toBe(input)
  }
})

test('按页面展示快捷问题和文章实际标题，未登录提示复用 GitHub 返回地址', async () => {
  const ui = await setup()
  ui.controller.routeChanged('/posts/article', '文章实际标题 - Setobox')
  await flush()
  expect(ui.query('.assistant-context').textContent).toContain('Agent 正在使用文章 文章实际标题')
  expect([...ui.dialog.querySelectorAll('.assistant-suggestion')].map(element => element.textContent?.trim())).toEqual(['这篇文章讲了什么？', '相关文章有哪些？', '如何订阅博客更新？'])
  await ui.click(ui.query('.assistant-suggestion'))
  expect(ui.controller.draft.value).toBe('这篇文章讲了什么？')
  expect(document.activeElement).toBe(ui.query('input'))
  ui.controller.session.value = { ...ui.controller.session.value!, authenticated: false }
  vi.stubGlobal('navigateTo', vi.fn(async () => {}))
  await flush()
  expect(ui.query('.assistant-login').textContent).toContain('在所有设备上保存你的会话和历史')
  expect(ui.query('.assistant-signin').textContent).toContain('Sign in')
  await ui.click(ui.query('.assistant-signin'))
  expect(navigateTo).toHaveBeenCalledWith('/login', { external: true })
})

test.each([[5, '晚上好'], [6, '早上好'], [10, '早上好'], [11, '中午好'], [17, '中午好'], [18, '晚上好']] as const)('本地 %s 点问候为 %s，减少动态效果时立即显示终态', async (hour, greeting) => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 10, hour))
  vi.spyOn(window, 'matchMedia').mockImplementation(query => ({ matches: true, media: query, onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: () => true }))
  const ui = await setup()
  expect(ui.query('.assistant-greeting').textContent?.trim()).toBe(greeting)
  expect(ui.dialog.classList.contains('assistant-preparing')).toBe(false)
  expect(ui.query('.assistant-composer').style.opacity).not.toBe('0')
})

test('编译后的浅色 scoped 样式选择输入框和覆盖背景，不修改 html 背景', () => {
  const source = readFileSync(new NodeURL('../app/components/assistant/AssistantPanel.vue', import.meta.url), 'utf8')
  const style = compileStyle({ source: parse(source).descriptor.styles[0]!.content, filename: 'AssistantPanel.vue', id: 'data-v-fixture', scoped: true })
  expect(style.errors).toEqual([])
  const sheet = new CSSStyleSheet()
  sheet.replaceSync(style.code)
  const rules = [...sheet.cssRules].filter((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule && rule.selectorText.includes('html.light'))
  expect(rules).toHaveLength(2)
  for (const rule of rules) {
    expect(rule.selectorText).not.toMatch(/^html\.light(?:,html\.light)*$/)
    expect(rule.selectorText).toContain('.assistant-')
  }
})
