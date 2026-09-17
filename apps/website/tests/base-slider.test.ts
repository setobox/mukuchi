// @vitest-environment happy-dom
import { afterEach, expect, test } from 'vite-plus/test'
import { createApp, h, nextTick, ref } from 'vue'
import BaseSlider from '../app/components/base/BaseSlider.vue'

const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach(cleanup => cleanup()))
function mount(initial: number, min: number, max: number, step: number, marks?: { value: number, label: string }[], origin?: number) {
  const host = document.createElement('div')
  document.body.append(host)
  const value = ref(initial)
  const app = createApp({ render: () => h(BaseSlider, { 'label': '参数', 'modelValue': value.value, min, max, step, marks, origin, 'editable': !marks, 'onUpdate:modelValue': next => value.value = next }) })
  app.mount(host)
  cleanups.push(() => {
    app.unmount()
    host.remove()
  })
  const thumb = host.querySelector<HTMLElement>('[role="slider"]')!
  async function key(key: string) {
    thumb.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
    await nextTick()
  }
  async function input(next: string) {
    const field = host.querySelector('input[type="number"]') as HTMLInputElement
    field.value = next
    field.dispatchEvent(new Event('change', { bubbles: true }))
    await nextTick()
    return field
  }
  return { host, value, thumb, key, input }
}

test('字重仅停在四个节点，键盘支持步进和首尾边界', async () => {
  const marks = [{ value: 400, label: '常规' }, { value: 500, label: '中等' }, { value: 600, label: '半粗' }, { value: 700, label: '粗体' }]
  const { host, value, thumb, key } = mount(600, 400, 700, 100, marks)
  expect(host.querySelector('output')?.textContent).toContain('600半粗')
  await key('ArrowLeft')
  expect(value.value).toBe(500)
  await key('Home')
  expect(value.value).toBe(400)
  await key('ArrowLeft')
  expect(value.value).toBe(400)
  await key('End')
  expect(value.value).toBe(700)
  expect(thumb.getAttribute('aria-valuetext')).toContain('粗体')
})

test('字号数值输入与滑动条同步，超出范围钳制，空输入恢复', async () => {
  const { host, value, thumb, key, input } = mount(56, 12, 256, 1)
  const field = host.querySelector('input[type="number"]') as HTMLInputElement
  field.value = '70'
  field.dispatchEvent(new Event('input', { bubbles: true }))
  await nextTick()
  expect(thumb.getAttribute('aria-valuenow')).toBe('70')
  await input('80')
  expect(thumb.getAttribute('aria-valuenow')).toBe('80')
  await key('ArrowRight')
  expect(value.value).toBe(81)
  expect((await input('500')).value).toBe('256')
  expect((await input('')).value).toBe('256')
  expect((await input('5')).value).toBe('12')
  value.value = 100
  await nextTick()
  expect(thumb.getAttribute('aria-valuenow')).toBe('100')
})

test('小数行距吸附到 0.1 倍步长且无浮点尾数', async () => {
  const { value, key, input } = mount(1.3, 1, 2, 0.1)
  await key('ArrowRight')
  expect(value.value).toBe(1.4)
  await input('1.76')
  expect(value.value).toBe(1.8)
  await key('End')
  expect(value.value).toBe(2)
  await key('ArrowRight')
  expect(value.value).toBe(2)
})

test('纵向偏移在零点两侧填充，方向键精确到 1px，边界输入钳制', async () => {
  const { host, value, key, input } = mount(0, -2048, 2048, 1, undefined, 0)
  const fill = host.querySelector<HTMLElement>('[data-slider-fill]')!
  expect(fill.style.width).toBe('0%')
  await key('ArrowLeft')
  expect(value.value).toBe(-1)
  await input('-1024')
  expect(fill.style.left).toBe('25%')
  expect(fill.style.width).toBe('25%')
  await input('1024')
  expect(fill.style.left).toBe('50%')
  expect(fill.style.width).toBe('25%')
  await input('3000')
  expect(value.value).toBe(2048)
})
