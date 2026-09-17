// @vitest-environment happy-dom
import { afterEach, expect, test } from 'vite-plus/test'
import { createApp, h, nextTick, ref } from 'vue'
import BaseSwitch from '../app/components/base/BaseSwitch.vue'

const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach(cleanup => cleanup()))
test('开关支持标签点击、键盘、外部同步及组件和表单禁用', async () => {
  const host = document.createElement('div')
  document.body.append(host)
  const value = ref(false)
  const disabled = ref(false)
  const formDisabled = ref(false)
  const app = createApp({ render: () => h('fieldset', { disabled: formDisabled.value }, [h(BaseSwitch, { 'label': '启用效果', 'modelValue': value.value, 'disabled': disabled.value, 'onUpdate:modelValue': next => value.value = next })]) })
  app.mount(host)
  cleanups.push(() => {
    app.unmount()
    host.remove()
  })
  const button = host.querySelector<HTMLButtonElement>('[role="switch"]')!
  host.querySelector('label')!.click()
  await nextTick()
  expect(value.value).toBe(true)
  button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  await nextTick()
  expect(value.value).toBe(false)
  value.value = true
  await nextTick()
  expect(button.getAttribute('aria-checked')).toBe('true')
  disabled.value = true
  await nextTick()
  button.click()
  expect(value.value).toBe(true)
  disabled.value = false
  formDisabled.value = true
  await nextTick()
  button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  expect(value.value).toBe(true)
})
