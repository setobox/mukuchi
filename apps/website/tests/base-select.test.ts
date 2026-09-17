// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { createApp, h, nextTick, ref } from 'vue'
import BaseSelect from '../app/components/base/BaseSelect.vue'
import BaseUiProvider from '../app/components/base/BaseUiProvider.vue'
import { overlayTargetKey } from '../app/shared/overlay'

const cleanups: (() => void)[] = []
afterEach(async () => {
  cleanups.splice(0).forEach(cleanup => cleanup())
  await nextTick()
  vi.restoreAllMocks()
})
function key(element: Element, value: string) {
  const event = new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true })
  element.dispatchEvent(event)
  return event
}
function mount(modal = false) {
  const host = document.createElement(modal ? 'dialog' : 'div')
  document.body.append(host)
  const value = ref<string | number>('')
  const disabled = ref(false)
  const options = [{ value: '', label: '全部' }, { value: '1', label: 'String one' }, { value: 1, label: 'Number one' }, { value: 'blocked', label: 'Disabled', disabled: true }]
  const app = createApp({ render: () => h(BaseUiProvider, null, { default: () => h(BaseSelect<string | number>, { options, 'label': '选项', 'modelValue': value.value, 'disabled': disabled.value, 'onUpdate:modelValue': next => value.value = next ?? '' }) }) })
  if (modal)
    app.provide(overlayTargetKey, ref(host))
  app.mount(host)
  cleanups.push(() => {
    app.unmount()
    host.remove()
  })
  const trigger = host.querySelector<HTMLButtonElement>('[role="combobox"]')!
  async function open() {
    trigger.focus()
    key(trigger, 'ArrowDown')
    await vi.waitFor(() => expect(document.querySelector('[role="listbox"]')).not.toBeNull())
    await nextTick()
    const items = [...document.querySelectorAll<HTMLElement>('[role="option"]')]
    await vi.waitFor(() => expect(document.activeElement).toBe(items[options.findIndex(option => option.value === value.value)]))
    return items
  }
  return { host, value, disabled, trigger, open }
}

test('下拉支持空字符串并保持字符串与数值的区别，外部更新同步显示', async () => {
  const { value, trigger, open } = mount()
  expect(trigger.textContent).toContain('全部')
  const options = await open()
  options[2]!.focus()
  key(options[2]!, 'Enter')
  await vi.waitFor(() => expect(value.value).toBe(1))
  await vi.waitFor(() => expect(document.activeElement).toBe(trigger))
  value.value = '1'
  await nextTick()
  expect(trigger.textContent).toContain('String one')
  const reopened = await open()
  reopened[0]!.focus()
  key(reopened[0]!, 'Enter')
  await vi.waitFor(() => expect(value.value).toBe(''))
  expect(trigger.textContent).toContain('全部')
})

test('方向键、Home、End 和字符定位可用，禁用项不能选择', async () => {
  const { value, trigger, disabled, open } = mount()
  const options = await open()
  options[0]!.focus()
  key(options[0]!, 'ArrowDown')
  await vi.waitFor(() => expect(document.activeElement).toBe(options[1]))
  key(options[1]!, 'End')
  await vi.waitFor(() => expect(document.activeElement).toBe(options[2]))
  key(options[2]!, 'Home')
  await vi.waitFor(() => expect(document.activeElement).toBe(options[0]))
  key(options[0]!, 'n')
  await vi.waitFor(() => expect(document.activeElement).toBe(options[2]))
  key(options[3]!, 'Enter')
  await nextTick()
  expect(value.value).toBe('')
  key(options[2]!, 'Escape')
  await vi.waitFor(() => expect(trigger.getAttribute('aria-expanded')).toBe('false'))
  disabled.value = true
  await nextTick()
  expect(trigger.disabled).toBe(true)
  key(trigger, 'ArrowDown')
  await nextTick()
  expect(trigger.getAttribute('aria-expanded')).toBe('false')
})

test('弹窗内下拉挂载到当前弹窗，Esc 消费默认行为并恢复焦点', async () => {
  const { host, trigger, open } = mount(true)
  const options = await open()
  expect(host.querySelector('[role="listbox"]')).not.toBeNull()
  options[0]!.focus()
  const event = key(options[0]!, 'Escape')
  expect(event.defaultPrevented).toBe(true)
  await vi.waitFor(() => expect(document.activeElement).toBe(trigger))
  expect(trigger.getAttribute('aria-expanded')).toBe('false')
})

test('滚动条已预留时不重复补偿，关闭恢复页面样式', async () => {
  vi.spyOn(CSS, 'supports').mockReturnValue(true)
  vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(window.innerWidth - 15)
  const { trigger, open } = mount()
  const options = await open()
  expect(document.body.style.paddingRight).toBe('0px')
  key(options[0]!, 'Escape')
  await vi.waitFor(() => expect(document.activeElement).toBe(trigger))
  expect(document.body.style.paddingRight).toBe('')
})
