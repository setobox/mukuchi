// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test'
import * as Vue from 'vue'
import AppIcon from '../app/components/AppIcon.vue'
import BaseButton from '../app/components/base/BaseButton.vue'
import BaseSelect from '../app/components/base/BaseSelect.vue'
import BaseSwitch from '../app/components/base/BaseSwitch.vue'
import CoverAssetInput from '../app/components/cover/CoverAssetInput.vue'
import CoverMaker from '../app/components/cover/CoverMaker.client.vue'
import CoverNumber from '../app/components/cover/CoverNumber.vue'
import CoverShadowControls from '../app/components/cover/CoverShadowControls.vue'
import CoverTextControls from '../app/components/cover/CoverTextControls.vue'

const assets = vi.hoisted(() => ({ readRaster: vi.fn(), readIcon: vi.fn() }))
vi.mock('../app/features/cover/assets', () => assets)
vi.mock('../app/features/cover/export', () => ({ createTextMeasurer: () => (text: string, style: { size: number }) => text.length * style.size, exportCover: vi.fn(), downloadCover: vi.fn() }))
vi.mock('../app/features/cover/motion', () => ({ useCoverMotion: () => ({ play: vi.fn() }) }))
const cleanups: (() => void)[] = []
beforeEach(() => {
  for (const name of ['ref', 'shallowRef', 'computed', 'useId', 'useTemplateRef', 'watch', 'nextTick', 'onBeforeUnmount'] as const)
    vi.stubGlobal(name, Vue[name])
})
afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup())
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})
test('默认及重置恢复白底深色文字、导入成功关闭透明、替换失败保留素材和状态', async () => {
  const host = document.createElement('div')
  document.body.append(host)
  const app = Vue.createApp(CoverMaker)
  for (const [name, component] of Object.entries({ AppIcon, BaseButton, BaseSelect, BaseSwitch, CoverAssetInput, CoverNumber, CoverShadowControls, CoverTextControls }))
    app.component(name, component)
  app.component('LazyCoverIconPicker', { render: () => null })
  app.mount(host)
  cleanups.push(() => {
    app.unmount()
    host.remove()
  })
  expect(host.querySelector<HTMLInputElement>('input[type="color"]')?.value).toBe('#252423')
  host.querySelectorAll<HTMLButtonElement>('[role="tab"]')[2]!.click()
  await Vue.nextTick()
  const transparent = () => host.querySelector('[role="switch"]')!
  expect(transparent().getAttribute('aria-checked')).toBe('false')
  expect(host.querySelector<HTMLInputElement>('input[type="color"]')?.value).toBe('#ffffff')
  ;(transparent() as HTMLButtonElement).click()
  await Vue.nextTick()
  expect(transparent().getAttribute('aria-checked')).toBe('true')
  async function upload() {
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!
    Object.defineProperty(input, 'files', { configurable: true, value: [new File(['image'], 'background.png', { type: 'image/png' })] })
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await Vue.nextTick()
  }
  const image = { name: 'background.png', width: 600, height: 400, dataUrl: 'data:image/png;base64,eA==' }
  assets.readRaster.mockResolvedValueOnce(image)
  await upload()
  await vi.waitFor(() => expect(transparent().getAttribute('aria-checked')).toBe('false'))
  await vi.waitFor(() => expect(transparent().matches(':disabled')).toBe(false))
  expect(host.querySelector('img[alt="已上传背景"]')?.getAttribute('src')).toBe(image.dataUrl)
  ;(transparent() as HTMLButtonElement).click()
  await Vue.nextTick()
  assets.readRaster.mockRejectedValueOnce(new Error('素材超过 5 MiB'))
  await upload()
  await vi.waitFor(() => expect(host.textContent).toContain('素材超过 5 MiB'))
  await vi.waitFor(() => expect(transparent().matches(':disabled')).toBe(false))
  expect(transparent().getAttribute('aria-checked')).toBe('true')
  expect(host.querySelector('img[alt="已上传背景"]')?.getAttribute('src')).toBe(image.dataUrl)
  ;[...host.querySelectorAll('button')].find(button => button.textContent?.trim() === '重置')!.click()
  await Vue.nextTick()
  expect(host.querySelector<HTMLInputElement>('input[type="color"]')?.value).toBe('#252423')
  host.querySelectorAll<HTMLButtonElement>('[role="tab"]')[2]!.click()
  await Vue.nextTick()
  expect(transparent().getAttribute('aria-checked')).toBe('false')
  expect(host.querySelector<HTMLInputElement>('input[type="color"]')?.value).toBe('#ffffff')
  expect(host.querySelector('img[alt="已上传背景"]')).toBeNull()
})
