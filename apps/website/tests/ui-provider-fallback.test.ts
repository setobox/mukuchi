// @vitest-environment happy-dom
import { expect, test, vi } from 'vite-plus/test'
import { createApp, h } from 'vue'
import BaseSelect from '../app/components/base/BaseSelect.vue'
import BaseUiProvider from '../app/components/base/BaseUiProvider.vue'

test('不支持滚动条预留的浏览器沿用 Reka 间距补偿', async () => {
  vi.stubGlobal('CSS', { supports: () => false, escape: CSS.escape })
  vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(window.innerWidth - 15)
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({ render: () => h(BaseUiProvider, null, { default: () => h(BaseSelect, { options: [{ value: 'png', label: 'PNG' }], modelValue: 'png' }) }) })
  try {
    app.mount(host)
    const trigger = host.querySelector<HTMLButtonElement>('[role="combobox"]')!
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
    await vi.waitFor(() => expect(document.querySelector('[role="listbox"]')).not.toBeNull())
    expect(document.body.style.paddingRight).toBe('15px')
  }
  finally {
    app.unmount()
    host.remove()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  }
})
