// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { createApp, h, nextTick, ref } from 'vue'
import AppIcon from '../app/components/AppIcon.vue'
import AcrylicDialog from '../app/components/base/AcrylicDialog.vue'
import MenuToggleIcon from '../app/components/site/MenuToggleIcon.vue'

const cleanups: (() => void)[] = []

afterEach(() => {
  cleanups.splice(0).reverse().forEach(cleanup => cleanup())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function flush() {
  await nextTick()
  await nextTick()
  await nextTick()
}

function mountDrawer(reduce = true) {
  vi.spyOn(window, 'matchMedia').mockImplementation(query => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: () => true,
  }))
  const frames = new Map<number, FrameRequestCallback>()
  let frameId = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback)
    return frameId
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  const open = ref(false)
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({
    render: () => h(AcrylicDialog, {
      'title': '导航',
      'placement': 'drawer',
      'modelValue': open.value,
      'onUpdate:modelValue': value => open.value = value,
    }, {
      trigger: (slot: { open: boolean, expanded: boolean, toggle: () => void }) => h('button', {
        'aria-label': slot.open ? '关闭导航' : '打开导航',
        'aria-expanded': slot.open,
        'onClick': slot.toggle,
      }, h(MenuToggleIcon, { expanded: slot.expanded })),
      default: () => h('nav', [
        h('a', { href: '/posts', onClick: (event: Event) => {
          event.preventDefault()
          open.value = false
        } }, '文章'),
        h('a', { href: '/about' }, '关于'),
      ]),
    }),
  })
  app.component('AppIcon', AppIcon)
  app.mount(host)
  const dialog = document.querySelector<HTMLDialogElement>('dialog')!
  vi.spyOn(dialog, 'showModal').mockImplementation(() => {
    dialog.open = true
  })
  vi.spyOn(dialog, 'close').mockImplementation(() => {
    dialog.open = false
  })
  const button = host.querySelector<HTMLButtonElement>('button')!
  const panel = dialog.querySelector<HTMLElement>('.drawer-panel')!
  cleanups.push(() => {
    app.unmount()
    host.remove()
  })
  return {
    host,
    dialog,
    panel,
    button,
    open,
    frame: async () => {
      const callbacks = [...frames.values()]
      frames.clear()
      callbacks.forEach(callback => callback(0))
      await flush()
    },
  }
}

test('同一个按钮进入抽屉后保持可操作，关闭后回到页头并恢复焦点', async () => {
  const { host, dialog, button } = mountDrawer()
  button.focus()
  button.click()
  await flush()
  expect(dialog.open).toBe(true)
  expect(dialog.querySelector('button')).toBe(button)
  expect(document.querySelectorAll('button')).toHaveLength(1)
  expect(button.getAttribute('aria-expanded')).toBe('true')
  expect(button.querySelector('svg')?.getAttribute('data-expanded')).toBe('true')
  expect(document.body.style.overflow).toBe('hidden')
  button.click()
  await flush()
  expect(dialog.open).toBe(false)
  expect(host.querySelector('button')).toBe(button)
  expect(document.activeElement).toBe(button)
  expect(button.querySelector('svg')?.getAttribute('data-expanded')).toBe('false')
  expect(document.body.style.overflow).not.toBe('hidden')
})

test('原生弹窗打开时不会为了聚焦屏幕外的导航项而横向滚动', async () => {
  const { dialog, button } = mountDrawer(false)
  vi.mocked(dialog.showModal).mockImplementation(() => {
    dialog.open = true
    // Model native dialog autofocus before the component applies its own focus.
    const target = dialog.hasAttribute('autofocus')
      ? dialog
      : dialog.querySelector<HTMLElement>('[autofocus], a[href], button')
    target?.focus()
    if (target?.matches('a[href]'))
      dialog.scrollLeft = 316
  })
  button.focus()
  button.click()
  await flush()
  expect(dialog.scrollLeft).toBe(0)
  expect(document.activeElement).toBe(button)
})

test('只有外侧点击关闭抽屉，选择导航和 Escape 同样复位按钮', async () => {
  const { dialog, button, panel } = mountDrawer()
  button.click()
  await flush()
  panel.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
  dialog.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await flush()
  expect(dialog.open).toBe(true)
  dialog.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
  dialog.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await flush()
  expect(dialog.open).toBe(false)
  button.click()
  await flush()
  dialog.querySelector<HTMLAnchorElement>('a')!.click()
  await flush()
  expect(dialog.open).toBe(false)
  button.click()
  await flush()
  const cancel = new Event('cancel', { cancelable: true })
  dialog.dispatchEvent(cancel)
  await flush()
  expect(cancel.defaultPrevented).toBe(true)
  expect(dialog.open).toBe(false)
})

test('反向点击取消旧关闭流程，新动画结束前保留按钮与滚动锁', async () => {
  const { dialog, panel, button, frame } = mountDrawer(false)
  const exits: (() => void)[] = []
  Object.defineProperty(panel, 'getAnimations', { configurable: true, value: () => [{ finished: new Promise<void>(resolve => exits.push(resolve)) }] })
  button.focus()
  button.click()
  await flush()
  await frame()
  await frame()
  expect(button.querySelector('svg')?.getAttribute('data-expanded')).toBe('true')
  button.click()
  await flush()
  expect(dialog.open).toBe(true)
  button.click()
  await flush()
  await frame()
  await frame()
  button.click()
  await flush()
  exits[0]!()
  await flush()
  expect(dialog.open).toBe(true)
  expect(document.body.style.overflow).toBe('hidden')
  exits[1]!()
  await vi.waitFor(() => {
    expect(dialog.open).toBe(false)
    expect(document.activeElement).toBe(button)
  })
})
