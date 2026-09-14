// @vitest-environment happy-dom
import { expect, test } from 'vite-plus/test'
import { createApp, h, nextTick } from 'vue'
import AppIcon from '../app/components/AppIcon.vue'
import PaletteModeMenu from '../app/components/commands/PaletteModeMenu.vue'

test('图标下拉支持方向键切换、Escape 收起和点击选择模式', async () => {
  const host = document.createElement('div')
  document.body.append(host)
  const selected: string[] = []
  const app = createApp({ render: () => h(PaletteModeMenu, {
    mode: 'search',
    features: { search: true, commands: true },
    active: true,
    onSelect: mode => selected.push(mode),
  }) })
  app.component('AppIcon', AppIcon)
  try {
    app.mount(host)
    const trigger = host.querySelector<HTMLButtonElement>('button')!
    trigger.click()
    await nextTick()
    const items = host.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(items).toHaveLength(2)
    expect(document.activeElement).toBe(items[0])
    items[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    expect(document.activeElement).toBe(items[1])
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    items[1]!.dispatchEvent(escape)
    await nextTick()
    expect(escape.defaultPrevented).toBe(true)
    expect(host.querySelector('[role="menu"]')).toBeNull()
    expect(document.activeElement).toBe(trigger)
    trigger.click()
    await nextTick()
    host.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')[1]!.click()
    await nextTick()
    expect(selected).toEqual(['commands'])
    expect(host.querySelector('[role="menu"]')).toBeNull()
  }
  finally {
    app.unmount()
    host.remove()
  }
})

test('仅启用一个模式时不打开无可切换项的下拉菜单', async () => {
  const host = document.createElement('div')
  const app = createApp({ render: () => h(PaletteModeMenu, { mode: 'commands', features: { search: false, commands: true }, active: true }) })
  app.component('AppIcon', AppIcon)
  try {
    app.mount(host)
    const trigger = host.querySelector<HTMLButtonElement>('button')!
    expect(trigger.disabled).toBe(true)
    trigger.click()
    await nextTick()
    expect(host.querySelector('[role="menu"]')).toBeNull()
  }
  finally {
    app.unmount()
  }
})
