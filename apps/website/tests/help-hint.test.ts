// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { createApp, h, nextTick, ref } from 'vue'
import BaseHelpHint from '../app/components/base/BaseHelpHint.vue'
import BaseTooltip from '../app/components/base/BaseTooltip.vue'

const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach(cleanup => cleanup()))

async function mount() {
  const active = ref(true)
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({ render: () => h('form', { onSubmit: (event: Event) => event.preventDefault() }, [
    h(BaseHelpHint, { label: '生成与额度说明', text: '额度按北京时间重置。', active: active.value }),
    h(BaseTooltip, { text: '原有悬停提示' }, { default: () => h('button', { 'type': 'button', 'aria-label': '普通提示' }, '标签') }),
    h('button', { 'type': 'button', 'aria-label': '外部按钮' }, '外部'),
  ]) })
  app.mount(host)
  cleanups.push(() => {
    app.unmount()
    host.remove()
  })
  await nextTick()
  return { host, active, button: host.querySelector<HTMLButtonElement>('[aria-label="生成与额度说明"]')! }
}
const tooltip = () => document.querySelector('[role="tooltip"]')
async function visible(text = '额度按北京时间重置。') {
  await vi.waitFor(() => expect(tooltip()?.textContent).toBe(text))
}
async function hidden() {
  await vi.waitFor(() => expect(tooltip()).toBeNull())
}

test('信息图标默认收起，悬停展示说明，Esc 关闭且不提交表单', async () => {
  const { host, button } = await mount()
  const submit = vi.fn()
  host.querySelector('form')!.addEventListener('submit', submit)
  expect(tooltip()).toBeNull()
  button.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'mouse', bubbles: true }))
  await visible()
  expect(button.getAttribute('aria-describedby')).toBe(tooltip()!.id)
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await hidden()
  expect(button.type).toBe('button')
  expect(submit).not.toHaveBeenCalled()
})

test('键盘聚焦展示说明，移开焦点关闭；原有普通 Tooltip 仍可正常使用', async () => {
  const { host, button } = await mount()
  button.focus()
  await visible()
  host.querySelector<HTMLButtonElement>('[aria-label="普通提示"]')!.focus()
  await visible('原有悬停提示')
  host.querySelector<HTMLButtonElement>('[aria-label="外部按钮"]')!.focus()
  await hidden()
})

test('触屏点击开关说明，点击外部关闭，重复操作不会提交表单', async () => {
  const { host, button } = await mount()
  const tap = () => {
    button.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true }))
    button.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'touch', bubbles: true }))
    button.click()
  }
  tap()
  await visible()
  tap()
  await hidden()
  tap()
  await visible()
  host.querySelector('[aria-label="外部按钮"]')!.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'mouse', bubbles: true }))
  await hidden()
})

test('切换隐藏设置页时关闭弹层，迟到的悬停也不能重新打开', async () => {
  const { button, active } = await mount()
  button.focus()
  await visible()
  active.value = false
  await hidden()
  expect(button.disabled).toBe(true)
  button.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'mouse', bubbles: true }))
  await nextTick()
  expect(tooltip()).toBeNull()
  active.value = true
  await nextTick()
  expect(tooltip()).toBeNull()
})
