// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test'
import { createApp, createSSRApp, h, nextTick, reactive, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'
import BaseTimeSeriesChart from '../app/components/base/BaseTimeSeriesChart.vue'

const size = { width: ref(400), height: ref(200) }
const visibility = ref('visible')
const inViewport = ref(true)
const reducedMotion = ref('no-preference')
vi.mock('@vueuse/core', async original => ({
  ...await original<typeof import('@vueuse/core')>(),
  useElementSize: () => size,
  useElementVisibility: () => inViewport,
  useDocumentVisibility: () => visibility,
  usePreferredReducedMotion: () => reducedMotion,
}))

interface NativeAnimation {
  element: Element
  keyframes: Keyframe[]
  options: KeyframeAnimationOptions
  currentTime: number
  finished: Promise<void>
  complete: () => void
  cancel: ReturnType<typeof vi.fn>
}
const animations: NativeAnimation[] = []
const frames = new Map<number, FrameRequestCallback>()
let nextFrame = 0
const cleanups: (() => void)[] = []
const originalAnimate = Object.getOwnPropertyDescriptor(Element.prototype, 'animate')
const samples = [10, 40, 20].map((value, time) => ({ time, value }))

beforeEach(() => {
  size.width.value = 400
  size.height.value = 200
  visibility.value = 'visible'
  inViewport.value = true
  reducedMotion.value = 'no-preference'
  animations.length = 0
  frames.clear()
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback)
    return nextFrame
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, value(this: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
    let complete!: () => void
    const finished = new Promise<void>(resolve => complete = resolve)
    const animation = { element: this, keyframes, options, currentTime: 0, finished, complete, cancel: vi.fn() }
    animations.push(animation)
    return animation
  } })
})
afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup())
  if (originalAnimate)
    Object.defineProperty(Element.prototype, 'animate', originalAnimate)
  else
    Reflect.deleteProperty(Element.prototype, 'animate')
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
async function flush() {
  for (let i = 0; i < 8; i++) await nextTick()
}
function runFrame() {
  const pending = [...frames.values()]
  frames.clear()
  pending.forEach(callback => callback(0))
}
async function mount(overrides: Partial<InstanceType<typeof BaseTimeSeriesChart>['$props']> = {}, pair = false) {
  const props = reactive({ title: '浏览量 PV', formatTime: (time: number) => `日期 ${time}`, ...overrides, points: [...(overrides.points ?? samples)] })
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({ render: () => h('div', [h(BaseTimeSeriesChart, props), ...(pair ? [h(BaseTimeSeriesChart, { title: '访客数 UV', points: samples })] : [])]) })
  app.mount(host)
  const cleanup = () => {
    app.unmount()
    host.remove()
  }
  cleanups.push(cleanup)
  await flush()
  const plot = host.querySelector<HTMLElement>('[data-chart-plot]')!
  const value = () => host.querySelector('[data-chart-value]')!.textContent
  const line = () => host.querySelector('[data-chart-line]')!.getAttribute('d')
  return { host, plot, props, value, line, cleanup }
}
function append(state: { points: { time: number, value: number | null }[] }, value = 60) {
  state.points = [...state.points.slice(1), { time: state.points.at(-1)!.time + 1, value }]
}
function pointer(plot: HTMLElement, type: string, x: number, pointerType = 'mouse') {
  plot.dispatchEvent(new PointerEvent(type, { clientX: x, pointerType, pointerId: 1, bubbles: true }))
}

test('默认显示最近真实采样；鼠标、键盘与触摸选择相互独立，缺失值不插值', async () => {
  const { host, plot, value } = await mount({}, true)
  expect(value()).toBe('20')
  pointer(plot, 'pointermove', 180)
  await flush()
  expect(value()).toBe('40')
  expect(host.querySelectorAll('[data-chart-value]')[1]!.textContent).toBe('20')
  expect(host.querySelector('[data-chart-cursor] circle')?.getAttribute('cx')).toBe('200')
  pointer(plot, 'pointerleave', 0)
  await flush()
  expect(value()).toBe('20')
  for (const [key, expected] of [['ArrowLeft', '40'], ['Home', '10'], ['End', '20'], ['Escape', '20']]) {
    plot.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    await flush()
    expect(value()).toBe(expected)
  }
  pointer(plot, 'pointerdown', 0, 'touch')
  pointer(plot, 'pointerup', 0, 'touch')
  pointer(plot, 'pointerleave', 0, 'touch')
  await flush()
  expect(value()).toBe('10')
  document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await flush()
  expect(value()).toBe('20')
  expect(frames.size).toBe(0)
})

test('空、缺失与真实零值的显示不同；单点居中，零值曲线及发光区域仍有效', async () => {
  const { host, props, value, line } = await mount({ points: [] })
  expect(value()).toBe('—')
  expect(host.textContent).toContain('暂无有效采样数据')
  props.points = [{ time: 0, value: 0 }]
  await flush()
  expect(value()).toBe('0')
  expect(line()).toBe('M200,188')
  expect(host.querySelector('filter')?.getAttribute('filterUnits')).toBe('userSpaceOnUse')
  props.points = [{ time: 0, value: 0 }, { time: 1, value: null }]
  await flush()
  expect(value()).toBe('—')
  expect(host.querySelector<HTMLElement>('[data-chart-endpoint]')!.style.visibility).toBe('hidden')
})

test('实时追加仅生成一次扩展路径，原生平移与端点动画同步；只有悬停时请求帧', async () => {
  const { host, plot, props, value, line } = await mount({ mode: 'live', windowSize: 3, domain: [0, 100] })
  expect(animations).toHaveLength(0)
  append(props)
  await flush()
  expect(animations).toHaveLength(3)
  expect(animations[0]!.keyframes).toEqual([{ transform: 'translateX(0px)' }, { transform: 'translateX(-200px)' }])
  expect(animations[1]!.keyframes).toEqual(animations[0]!.keyframes)
  expect(animations[2]!.options.easing).toBe('cubic-bezier(0.5, 0, 0.5, 1)')
  expect(frames.size).toBe(0)
  const path = line()
  pointer(plot, 'pointermove', 280)
  await flush()
  expect(value()).toBe('40')
  animations[0]!.currentTime = 700
  runFrame()
  await flush()
  expect(value()).toBe('20')
  expect(line()).toBe(path)
  expect(frames.size).toBe(1)
  pointer(plot, 'pointerleave', 0)
  expect(frames.size).toBe(0)
  animations[0]!.complete()
  await flush()
  expect(line()).not.toBe(path)
  expect(value()).toBe('60')
  expect(host.querySelector<HTMLElement>('[data-chart-track]')!.style.width).toBe('400px')
  expect(animations.every(animation => animation.cancel.mock.calls.length === 1)).toBe(true)
})

test('改变尺寸从当前进度续播，重叠更新直接显示最新窗口；迟到完成不覆盖新动画', async () => {
  const { props, value, line } = await mount({ mode: 'live', windowSize: 3, domain: [0, 100] })
  append(props)
  await flush()
  animations[0]!.currentTime = 450
  size.width.value = 800
  await flush()
  expect(animations).toHaveLength(6)
  expect(animations[3]!.currentTime).toBe(450)
  expect(animations[3]!.keyframes[1]!.transform).toBe('translateX(-400px)')
  append(props, 70)
  await flush()
  expect(animations).toHaveLength(6)
  expect(value()).toBe('70')
  expect(animations[3]!.cancel).toHaveBeenCalledOnce()
  append(props, 80)
  await flush()
  const path = line()
  animations[0]!.complete()
  animations[3]!.complete()
  await flush()
  expect(line()).toBe(path)
  expect(animations[6]!.cancel).not.toHaveBeenCalled()
})

test('父组件重新创建相同固定范围数组，不中断单点追加动画', async () => {
  const { props } = await mount({ mode: 'live', windowSize: 3, domain: [0, 100] })
  append(props)
  props.domain = [0, 100]
  await flush()
  expect(animations).toHaveLength(3)
  expect(animations[0]!.cancel).not.toHaveBeenCalled()
})

test.each(['document', 'viewport', 'motion', 'active'] as const)('%s 关闭动效会取消动画与帧，恢复不补播；卸载释放资源', async (kind) => {
  const chart = await mount({ mode: 'live', windowSize: 3, domain: [0, 100], active: true })
  append(chart.props)
  await flush()
  pointer(chart.plot, 'pointermove', 200)
  expect(frames.size).toBe(1)
  const toggle = (enabled: boolean) => {
    if (kind === 'document')
      visibility.value = enabled ? 'visible' : 'hidden'
    if (kind === 'viewport')
      inViewport.value = enabled
    if (kind === 'motion')
      reducedMotion.value = enabled ? 'no-preference' : 'reduce'
    if (kind === 'active')
      chart.props.active = enabled
  }
  toggle(false)
  await flush()
  expect(frames.size).toBe(0)
  expect(animations[0]!.cancel).toHaveBeenCalledOnce()
  append(chart.props, 70)
  await flush()
  expect(chart.value()).toBe('70')
  toggle(true)
  await flush()
  expect(animations).toHaveLength(3)
  append(chart.props, 80)
  await flush()
  expect(animations).toHaveLength(6)
  cleanups.splice(cleanups.indexOf(chart.cleanup), 1)
  chart.cleanup()
  expect(animations[3]!.cancel).toHaveBeenCalledOnce()
  expect(frames.size).toBe(0)
  animations[3]!.complete()
  await flush()
})

test('窗口未满、范围变化、批量更新、历史模式均直接更新；缺少 WAAPI 时安全降级', async () => {
  const { props, value } = await mount({ mode: 'live', windowSize: 60, domain: [0, 100] })
  append(props)
  await flush()
  expect(animations).toHaveLength(0)
  props.windowSize = 3
  props.domain = 'zero'
  await flush()
  append(props, 1000)
  await flush()
  expect(animations).toHaveLength(0)
  props.points = props.points.map(point => ({ ...point, time: point.time + 10 }))
  await flush()
  expect(animations).toHaveLength(0)
  props.mode = 'history'
  await flush()
  append(props, 900)
  await flush()
  expect(animations).toHaveLength(0)
  props.mode = 'live'
  props.domain = [0, 1000]
  await flush()
  Reflect.deleteProperty(Element.prototype, 'animate')
  append(props, 800)
  await flush()
  expect(value()).toBe('800')
})

test('多实例 SVG 标识唯一，SSR 和水合一致', async () => {
  const pair = { render: () => h('div', [h(BaseTimeSeriesChart, { title: 'PV', points: samples }), h(BaseTimeSeriesChart, { title: 'UV', points: samples })]) }
  const html = await renderToString(createSSRApp(pair))
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.append(host)
  const warn = vi.spyOn(console, 'warn')
  const error = vi.spyOn(console, 'error')
  const app = createSSRApp(pair)
  app.mount(host)
  cleanups.push(() => {
    app.unmount()
    host.remove()
  })
  await flush()
  const ids = [...host.querySelectorAll('[id]')].map(element => element.id)
  expect(new Set(ids).size).toBe(ids.length)
  expect(warn).not.toHaveBeenCalled()
  expect(error).not.toHaveBeenCalled()
})
