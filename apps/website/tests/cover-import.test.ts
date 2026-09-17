// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { createApp, h, nextTick, ref } from 'vue'
import CoverAssetInput from '../app/components/cover/CoverAssetInput.vue'

const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach(cleanup => cleanup()))
function mount() {
  const host = document.createElement('div')
  document.body.append(host)
  const receive = vi.fn()
  const disabled = ref(false)
  const app = createApp({ render: () => h(CoverAssetInput, { label: '选择背景图片', accept: 'image/png', disabled: disabled.value, onFile: receive }) })
  app.mount(host)
  cleanups.push(() => {
    app.unmount()
    host.remove()
  })
  return { host, receive, disabled, zone: host.querySelector('[role="group"]')! }
}
function transfer(type: string, files: File[]) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, type === 'paste' ? 'clipboardData' : 'dataTransfer', { value: { files } })
  return event
}

test('拖拽和图片粘贴交付同一文件，普通文本粘贴不被拦截', () => {
  const { zone, receive } = mount()
  const image = new File(['png'], 'background.png', { type: 'image/png' })
  const paste = transfer('paste', [image])
  zone.dispatchEvent(paste)
  expect(paste.defaultPrevented).toBe(true)
  zone.dispatchEvent(transfer('drop', [image]))
  expect(receive.mock.calls.map(call => call[0])).toEqual([image, image])
  const text = transfer('paste', [])
  zone.dispatchEvent(text)
  expect(text.defaultPrevented).toBe(false)
  document.body.dispatchEvent(transfer('paste', [image]))
  expect(receive).toHaveBeenCalledTimes(2)
})

test('处理期间忽略新的粘贴和拖拽，恢复后可再次导入', async () => {
  const { zone, receive, disabled } = mount()
  const image = new File(['png'], 'background.png', { type: 'image/png' })
  disabled.value = true
  await nextTick()
  zone.dispatchEvent(transfer('paste', [image]))
  zone.dispatchEvent(transfer('drop', [image]))
  expect(receive).not.toHaveBeenCalled()
  disabled.value = false
  await nextTick()
  zone.dispatchEvent(transfer('drop', [image]))
  expect(receive).toHaveBeenCalledWith(image)
})
