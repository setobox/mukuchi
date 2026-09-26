// @vitest-environment happy-dom
import type { Component } from 'vue'
import { parseMarkdown } from '@nuxtjs/mdc/runtime'
import MDCRenderer from '@nuxtjs/mdc/runtime/components/MDCRenderer.vue'
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { createApp, createSSRApp, h, nextTick, ref, Suspense } from 'vue'
import { renderToString } from 'vue/server-renderer'
import BaseCollapsible from '../app/components/base/BaseCollapsible.vue'
import Collapse from '../app/components/content/Collapse.vue'
import { findHashTarget, revealContent } from '../app/features/collapse/reveal'

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).reverse().forEach(close => close())
  vi.restoreAllMocks()
})
async function flush() {
  for (let index = 0; index < 5; index++) await nextTick()
}
const slots = {
  trigger: () => h('button', { type: 'button' }, '说明'),
  default: () => [h('h3', { id: 'C# 与 100%' }, '内层标题'), h('input', { 'aria-label': '笔记' })],
}
function mount(component: Component) {
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp(component)
  app.mount(host)
  cleanups.push(() => {
    app.unmount()
    host.remove()
  })
  return host
}

test('受控状态只由父级更新，非受控状态从 defaultOpen 初始化，禁用后不能切换', async () => {
  const open = ref(false)
  const disabled = ref(false)
  const update = vi.fn()
  const controlled = mount({ render: () => h(BaseCollapsible, { 'open': open.value, 'disabled': disabled.value, 'onUpdate:open': update }, slots) })
  const trigger = controlled.querySelector('button')!
  trigger.click()
  await flush()
  expect(update).toHaveBeenLastCalledWith(true)
  expect(trigger.getAttribute('aria-expanded')).toBe('false')
  open.value = true
  await flush()
  expect(trigger.getAttribute('aria-expanded')).toBe('true')
  disabled.value = true
  await flush()
  trigger.click()
  expect(update).toHaveBeenCalledOnce()
  expect(trigger.disabled).toBe(true)
  const uncontrolled = mount({ render: () => h(BaseCollapsible, { defaultOpen: true }, slots) })
  const independent = uncontrolled.querySelector('button')!
  expect(independent.getAttribute('aria-expanded')).toBe('true')
  independent.click()
  await flush()
  expect(independent.getAttribute('aria-expanded')).toBe('false')
  expect(trigger.getAttribute('aria-expanded')).toBe('true')
})

test('收起前恢复隐藏区域焦点，保留表单内容；连续切换和动态内容不重建正文', async () => {
  const open = ref(true)
  const disabled = ref(false)
  const extra = ref(false)
  const host = mount({ render: () => h(BaseCollapsible, { open: open.value, disabled: disabled.value }, {
    ...slots,
    default: () => [slots.default(), extra.value ? h('p', '后加载的内容') : null],
  }) })
  const input = host.querySelector('input')!
  input.value = '未提交的笔记'
  input.focus()
  open.value = false
  await flush()
  expect(document.activeElement).toBe(host.querySelector('button'))
  const region = host.querySelector('[data-collapsible-content]')!
  expect(region.hasAttribute('inert')).toBe(true)
  expect(region.getAttribute('aria-hidden')).toBe('true')
  extra.value = true
  for (const value of [true, false, true, false, true]) {
    open.value = value
    await flush()
  }
  expect(region.hasAttribute('inert')).toBe(false)
  expect(host.querySelector('input')).toBe(input)
  expect(input.value).toBe('未提交的笔记')
  expect(host.textContent).toContain('后加载的内容')
  input.focus()
  disabled.value = true
  open.value = false
  await flush()
  expect(document.activeElement).toBe(host.querySelector('button')!.parentElement)
})

test.each([false, true])('SSR 保留正文与有效控制 ID，水合保持初始展开状态 %s', async (defaultOpen) => {
  const component = { render: () => h(BaseCollapsible, { defaultOpen }, slots) }
  const host = document.createElement('div')
  host.innerHTML = await renderToString(createSSRApp(component))
  document.body.append(host)
  const id = host.querySelector('button')!.getAttribute('aria-controls')!
  expect(document.getElementById(id)).not.toBeNull()
  expect(host.querySelector('h3')?.textContent).toBe('内层标题')
  const warning = vi.spyOn(console, 'warn')
  const error = vi.spyOn(console, 'error')
  const app = createSSRApp(component)
  cleanups.push(() => {
    app.unmount()
    host.remove()
  })
  app.mount(host)
  await flush()
  expect(host.querySelector('button')!.getAttribute('aria-controls')).toBe(id)
  expect(host.querySelector('button')!.getAttribute('aria-expanded')).toBe(String(defaultOpen))
  expect(document.getElementById(id)!.hasAttribute('inert')).toBe(!defaultOpen)
  expect(warning).not.toHaveBeenCalled()
  expect(error).not.toHaveBeenCalled()
})

test('锚点按内外层一起展开，保留其他折叠状态，特殊字符无需 CSS 转义', async () => {
  const host = mount({ render: () => h('div', [
    h(BaseCollapsible, {}, { ...slots, default: () => h(BaseCollapsible, {}, slots) }),
    h(BaseCollapsible, {}, { ...slots, default: () => '另一块内容' }),
  ]) })
  const target = findHashTarget(`#${encodeURIComponent('C# 与 100%')}`)!
  expect(target).toBe(host.querySelector('h3'))
  await expect(revealContent(target)).resolves.toBe(true)
  expect([...host.querySelectorAll('button')].map(button => button.getAttribute('aria-expanded'))).toEqual(['true', 'true', 'false'])
  expect(target.closest('[inert]')).toBeNull()
  expect(findHashTarget('#%invalid')).toBeNull()
  expect(findHashTarget('#不存在')).toBeNull()
})

test('禁用或拒绝受控展开时不定位到隐藏正文，已卸载的目标不能完成定位', async () => {
  for (const props of [{ disabled: true }, { open: false }]) {
    const host = mount({ render: () => h(BaseCollapsible, props, slots) })
    await expect(revealContent(host.querySelector('h3')!)).resolves.toBe(false)
    cleanups.pop()!()
  }
  const host = mount({ render: () => h(BaseCollapsible, {}, slots) })
  const pending = revealContent(host.querySelector('h3')!)
  cleanups.pop()!()
  await expect(pending).resolves.toBe(false)
})

test('真实 MDC 支持标题、默认收起、显式初始展开、嵌套和 Markdown 正文', async () => {
  const source = ':::collapse{title="外层"}\n\n## 外层标题\n\n::collapse{title="内层" :open="true"}\n\n### 嵌套标题\n\n**加粗内容**与[链接](/about)。\n\n::\n\n:::\n\n::collapse{title="独立区域" open="false"}\n\n不应默认展开。\n\n::'
  const { body, data, toc } = await parseMarkdown(source, { highlight: false, toc: { depth: 5, searchDepth: 12 } })
  const component = { render: () => h(Suspense, {}, { default: () => h(MDCRenderer, { body, data, components: { collapse: Collapse, a: 'a' } }) }) }
  const html = await renderToString(createSSRApp(component))
  expect(html).toContain('嵌套标题')
  expect(html).toContain('<strong>加粗内容</strong>')
  expect(JSON.stringify(toc)).toContain('嵌套标题')
  const host = mount(component)
  await flush()
  expect([...host.querySelectorAll('button')].map(button => [button.textContent, button.getAttribute('aria-expanded')])).toEqual([
    ['外层', 'false'],
    ['内层', 'true'],
    ['独立区域', 'false'],
  ])
  await expect(revealContent(host.querySelector('h3')!)).resolves.toBe(true)
  expect(host.querySelector('h3')!.closest('[inert]')).toBeNull()
})
