// @vitest-environment happy-dom
import { expect, test, vi } from 'vite-plus/test'
import { createApp, h, nextTick, ref } from 'vue'
import BaseButton from '../app/components/base/BaseButton.vue'

test('等待按钮保留操作文案、播报忙碌状态并阻止重复点击', async () => {
  const loading = ref(false)
  const click = vi.fn()
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({ render: () => h(BaseButton, { loading: loading.value, onClick: click }, () => '保存设置') })
  app.mount(host)
  try {
    const button = host.querySelector('button')!
    button.click()
    loading.value = true
    await nextTick()
    button.click()
    expect(click).toHaveBeenCalledTimes(1)
    expect(button.disabled).toBe(true)
    expect(button.getAttribute('aria-busy')).toBe('true')
    expect(button.textContent).toContain('保存设置')
    loading.value = false
    await nextTick()
    button.click()
    expect(click).toHaveBeenCalledTimes(2)
  }
  finally {
    app.unmount()
    host.remove()
  }
})
