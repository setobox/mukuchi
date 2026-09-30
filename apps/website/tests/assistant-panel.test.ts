// @vitest-environment happy-dom
import type { ActionButton } from '../app/composables/useActionButton'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createGenerator } from 'unocss'
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { computed, createApp, h, nextTick, onBeforeUnmount, ref, toValue, useTemplateRef, watch } from 'vue'
import { compileStyle, parse } from 'vue/compiler-sfc'
import AssistantPanel from '../app/components/assistant/AssistantPanel.vue'
import FloatingActions from '../app/components/site/FloatingActions.vue'
import { createAssistantController } from '../app/features/assistant/controller'
import { createLocalHistory } from '../app/features/assistant/history'
import { memoryHistoryDatabase } from '../app/features/assistant/storage'
import unoConfig from '../uno.config'

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
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
  for (const [key, value] of Object.entries({ computed, nextTick, onBeforeUnmount, ref, useTemplateRef, watch, useAssistant: () => controller, useActionButton: registerAction })) vi.stubGlobal(key, value)
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

test('助手入口与同组按钮等大且有名称，对话表面沿用博客圆角变量', async () => {
  const ui = await setup()
  const action = ui.registerAction.mock.calls[0]![0]
  const home: ActionButton = { id: 'home', icon: 'i-lucide-house', label: '返回文章列表', onClick: vi.fn() }
  const actions = computed(() => [home, action].filter(item => toValue(item.visible ?? true)))
  vi.stubGlobal('useActionButtons', () => ({ actions }))
  const host = document.createElement('div')
  const style = document.createElement('style')
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const panelSource = readFileSync(resolve(root, 'app/components/assistant/AssistantPanel.vue'), 'utf8')
  const floatingSource = readFileSync(resolve(root, 'app/components/site/FloatingActions.vue'), 'utf8')
  const baseCss = readFileSync(resolve(root, 'app/assets/css/main.css'), 'utf8')
  const compiled = compileStyle({ source: parse(panelSource).descriptor.styles[0]!.content, filename: 'AssistantPanel.vue', id: 'assistant-style-test' })
  const uno = await createGenerator(unoConfig)
  const { css } = await uno.generate(floatingSource)
  style.textContent = `${baseCss}\n${css}\n${compiled.code}`
  document.head.append(style)
  document.body.append(host)
  const app = createApp(FloatingActions)
  app.mount(host)
  cleanups.push(() => {
    app.unmount()
    host.remove()
    style.remove()
  })
  ui.controller.close()
  await flush()
  const buttons = [...host.querySelectorAll('button')]
  expect(buttons).toHaveLength(2)
  const standard = getComputedStyle(buttons[0]!)
  const assistant = getComputedStyle(buttons[1]!)
  expect(assistant.width).toBe(standard.width)
  expect(assistant.height).toBe(standard.height)
  expect(assistant.borderRadius).toBe(standard.borderRadius)
  expect(action.label.trim()).not.toBe('')
  expect(buttons[1]?.getAttribute('aria-label')).toBe(action.label)
  expect(buttons[1]?.title).toBe(action.label)
  const open = vi.spyOn(action, 'onClick')
  await ui.click(buttons[1]!)
  await open.mock.results[0]?.value
  expect(ui.controller.mode.value).toBe('fullscreen')
  ui.seedReply()
  await flush()
  const panelRadius = getComputedStyle(document.documentElement).getPropertyValue('--radius-panel').trim()
  for (const selector of ['.assistant-user', '.assistant-reply', '.assistant-composer']) {
    const surface = getComputedStyle(ui.query(selector))
    expect(surface.borderTopLeftRadius).toBe(panelRadius)
    expect(surface.borderBottomLeftRadius).toBe(panelRadius)
    expect(surface.borderBottomRightRadius).toBe(panelRadius)
  }
  ui.controller.mode.value = 'floating'
  await flush()
  expect(getComputedStyle(ui.dialog).borderRadius).toBe(panelRadius)
})

test('全屏空白遮罩点击关闭，恢复入口焦点并保留草稿和消息', async () => {
  const ui = await setup()
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
  await ui.click(ui.query('.assistant-welcome p'))
  await ui.click(ui.query('.assistant-suggestion'))
  expect(ui.controller.draft.value).toBe('这篇文章讲了什么？')
  ui.seedReply()
  ui.controller.page.value = { path: '/posts/test' }
  await flush()
  for (const selector of ['.assistant-user', '.assistant-reply', '.assistant-reply span', '.assistant-composer', 'textarea', '.assistant-heading', '.assistant-context']) await ui.click(ui.query(selector))
  const backdrop = ui.query('.assistant-conversation')
  ui.pointerdown(ui.query('.assistant-user'))
  backdrop.click()
  await flush()
  ui.pointerdown(backdrop)
  ui.query('textarea').click()
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
