// @vitest-environment happy-dom
import type { Component } from 'vue'
import { createGenerator } from 'unocss'
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { computed, createApp, createSSRApp, defineComponent, effectScope, h, nextTick, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'
import baseCss from '../app/assets/css/main.css?raw'
import SiteDesktopNavigation from '../app/components/site/SiteDesktopNavigation.vue'
import SiteDirectory from '../app/components/site/SiteDirectory.vue'
import SiteMobileNavigation from '../app/components/site/SiteMobileNavigation.vue'
import { useNavigationCommands } from '../app/composables/useNavigationCommands'
import { createCommandController } from '../app/features/commands/controller'
import { navigationDestinations, resolveNavigation } from '../app/features/navigation/model'
import unoConfig from '../uno.config'
import { context, navigation } from './fixtures/navigation'

const cleanups: (() => void)[] = []
const NuxtLink = defineComponent({
  props: ['to'],
  setup: (props, { slots }) => () => h('a', { href: props.to, onClick: (event: Event) => event.preventDefault() }, slots.default?.()),
})
afterEach(() => {
  cleanups.splice(0).reverse().forEach(cleanup => cleanup())
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
async function flush() {
  for (let index = 0; index < 5; index++) await nextTick()
}
function mount(component: Component, initial: Record<string, unknown>) {
  const props = ref(initial)
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({ render: () => h(component, props.value) })
  app.component('NuxtLink', NuxtLink)
  app.mount(host)
  cleanups.push(() => {
    app.unmount()
    host.remove()
  })
  return { host, props }
}
const buttons = (host: HTMLElement) => [...host.querySelectorAll<HTMLButtonElement>('button[aria-expanded]')]
const pointer = (element: Element, type: string, pointerType = 'mouse') => element.dispatchEvent(new PointerEvent(type, { pointerType, bubbles: false }))

test.each(['dark', 'light'])('%s 下悬停图标或名称都由整个菜单项统一反馈，子控件不叠加背景', async (theme) => {
  const { host } = mount(SiteDesktopNavigation, { items: resolveNavigation(navigation, context()), resetKey: '/posts' })
  const trigger = buttons(host)[0]!
  const surface = trigger.parentElement!
  const link = surface.querySelector<HTMLAnchorElement>('a')!
  const uno = await createGenerator(unoConfig)
  const { css } = await uno.generate(host.outerHTML)
  const style = document.createElement('style')
  // Happy DOM has no pointer hover state. Match the real generated hover
  // selectors against attributes on the same target and ancestor chain.
  style.textContent = baseCss
    + css.replace(/(?<!\\):hover\b/g, '[data-test-hover]')
  document.head.append(style)
  const previousTheme = document.documentElement.className
  document.documentElement.className = theme
  host.style.setProperty('--color-accent-surface', '#a369ff1a')
  host.style.setProperty('--color-accent-text', theme === 'dark' ? '#b689ff' : '#774dba')
  cleanups.push(() => {
    style.remove()
    document.documentElement.className = previousTheme
  })
  const background = (element: HTMLElement) => getComputedStyle(element).backgroundColor
  const resting = background(surface)
  const controls = [trigger, link]
  const controlBackgrounds = controls.map(background)
  const snapshots = []
  for (const target of controls) {
    surface.toggleAttribute('data-test-hover', true)
    target.toggleAttribute('data-test-hover', true)
    expect(background(surface)).not.toBe(resting)
    expect(controls.map(background)).toEqual(controlBackgrounds)
    expect(getComputedStyle(trigger).color).toBe(getComputedStyle(link).color)
    snapshots.push([background(surface), getComputedStyle(trigger).color, getComputedStyle(link).color])
    target.removeAttribute('data-test-hover')
    surface.removeAttribute('data-test-hover')
  }
  expect(snapshots[0]).toEqual(snapshots[1])
  expect(background(surface)).toBe(resting)
})

test('悬停延迟、防误触和跨菜单移动；焦点留在子菜单时不会因移出鼠标关闭', async () => {
  vi.useFakeTimers()
  const { host } = mount(SiteDesktopNavigation, { items: resolveNavigation(navigation, context()), resetKey: '/posts' })
  const [content, my] = buttons(host)
  const group = content!.parentElement!.parentElement!
  pointer(group, 'pointerenter')
  await vi.advanceTimersByTimeAsync(149)
  expect(content!.getAttribute('aria-expanded')).toBe('false')
  pointer(group, 'pointerleave')
  await vi.advanceTimersByTimeAsync(250)
  expect(content!.getAttribute('aria-expanded')).toBe('false')
  pointer(group, 'pointerenter')
  await vi.advanceTimersByTimeAsync(150)
  expect(content!.getAttribute('aria-expanded')).toBe('true')
  pointer(group, 'pointerleave')
  await vi.advanceTimersByTimeAsync(100)
  pointer(group, 'pointerenter')
  await vi.advanceTimersByTimeAsync(200)
  expect(content!.getAttribute('aria-expanded')).toBe('true')
  const tag = group.querySelector<HTMLAnchorElement>('a[href="/tags"]')!
  tag.focus()
  pointer(group, 'pointerleave')
  await vi.advanceTimersByTimeAsync(250)
  expect(content!.getAttribute('aria-expanded')).toBe('true')
  pointer(my!.parentElement!.parentElement!, 'pointerenter')
  await vi.advanceTimersByTimeAsync(150)
  expect(content!.getAttribute('aria-expanded')).toBe('true')
  expect(my!.getAttribute('aria-expanded')).toBe('false')
  my!.focus()
  my!.click()
  await flush()
  expect(my!.getAttribute('aria-expanded')).toBe('true')
  expect(content!.getAttribute('aria-expanded')).toBe('false')
})

test('链接和展开按钮独立，方向键进入目录、Escape 恢复焦点，路由切换取消待展开菜单', async () => {
  vi.useFakeTimers()
  const { host, props } = mount(SiteDesktopNavigation, { items: resolveNavigation(navigation, context()), resetKey: '/posts' })
  const trigger = buttons(host)[0]!
  const group = trigger.parentElement!.parentElement!
  const link = group.querySelector<HTMLAnchorElement>('a')!
  expect(link.getAttribute('href')).toBe('/categories')
  expect(link.contains(trigger)).toBe(false)
  trigger.focus()
  trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
  await flush()
  expect(trigger.getAttribute('aria-expanded')).toBe('true')
  expect(document.activeElement?.getAttribute('href')).toBe('/categories')
  expect(document.activeElement).not.toBe(link)
  document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
  await flush()
  expect(trigger.getAttribute('aria-expanded')).toBe('false')
  expect(document.activeElement).toBe(trigger)
  expect(document.getElementById(trigger.getAttribute('aria-controls')!)!.hasAttribute('inert')).toBe(true)
  pointer(group, 'pointerleave')
  pointer(group, 'pointerenter')
  props.value.resetKey = '/about'
  await flush()
  await vi.advanceTimersByTimeAsync(400)
  expect(trigger.getAttribute('aria-expanded')).toBe('false')
  trigger.click()
  await flush()
  await vi.advanceTimersByTimeAsync(1)
  document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await flush()
  expect(trigger.getAttribute('aria-expanded')).toBe('false')
})

test('悬停打开后即使焦点尚未进入菜单，Escape 也会关闭并聚焦展开按钮', async () => {
  vi.useFakeTimers()
  const { host } = mount(SiteDesktopNavigation, { items: resolveNavigation(navigation, context()), resetKey: '/posts' })
  const trigger = buttons(host)[0]!
  pointer(trigger.parentElement!.parentElement!, 'pointerenter')
  await vi.advanceTimersByTimeAsync(150)
  expect(trigger.getAttribute('aria-expanded')).toBe('true')
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
  await flush()
  expect(trigger.getAttribute('aria-expanded')).toBe('false')
  expect(document.activeElement).toBe(trigger)
})

test('触屏不触发悬停，按钮点击与链接选择可打开和关闭桌面子菜单', async () => {
  vi.useFakeTimers()
  const { host } = mount(SiteDesktopNavigation, { items: resolveNavigation(navigation, context()), resetKey: '/posts' })
  const trigger = buttons(host)[1]!
  const group = trigger.parentElement!.parentElement!
  pointer(group, 'pointerenter', 'touch')
  await vi.advanceTimersByTimeAsync(300)
  expect(trigger.getAttribute('aria-expanded')).toBe('false')
  trigger.click()
  await flush()
  group.querySelector<HTMLAnchorElement>('a[href="/tools"]')!.click()
  await flush()
  expect(trigger.getAttribute('aria-expanded')).toBe('false')
})

test('移动导航展开当前分组，隐藏内容不可聚焦，Escape 优先收起子菜单，再次打开重置展开状态', async () => {
  const navigate = vi.fn()
  const { host, props } = mount(SiteMobileNavigation, { items: resolveNavigation(navigation, context('tools', '/tools/cover')), open: true, onNavigate: navigate })
  await flush()
  const [content, my] = buttons(host)
  expect(content!.getAttribute('aria-expanded')).toBe('false')
  expect(my!.getAttribute('aria-expanded')).toBe('true')
  expect(document.getElementById(content!.getAttribute('aria-controls')!)!.hasAttribute('inert')).toBe(true)
  expect(host.querySelector('a[href="/projects"]')).toBeNull()
  const tool = host.querySelector<HTMLAnchorElement>('a[href="/tools"]')!
  tool.focus()
  const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
  tool.dispatchEvent(escape)
  await flush()
  expect(escape.defaultPrevented).toBe(true)
  expect(document.activeElement).toBe(my)
  expect(my!.getAttribute('aria-expanded')).toBe('false')
  content!.click()
  await flush()
  expect(content!.getAttribute('aria-expanded')).toBe('true')
  expect(my!.getAttribute('aria-expanded')).toBe('false')
  props.value.open = false
  await flush()
  props.value.open = true
  await flush()
  expect(content!.getAttribute('aria-expanded')).toBe('false')
  expect(my!.getAttribute('aria-expanded')).toBe('true')
  host.querySelector<HTMLAnchorElement>('a[href="/tools"]')!.click()
  expect(navigate).toHaveBeenCalledOnce()
})

test('真实配置只开放已完成页面，目录卡片与命令使用相同目标且 SSR 可直接读取', async () => {
  vi.stubGlobal('defineAppConfig', <T>(value: T) => value)
  const { default: config } = await import('../app/app.config')
  const items = resolveNavigation(config.site.navigation, context('my', '/my'))
  expect(items.map(item => item.label)).toEqual(['首页', '分类', '我的', '关于'])
  const my = items.find(item => item.id === 'my')!
  expect(my.children.map(item => item.to)).toEqual(['/tools'])
  expect(navigationDestinations(config.site.navigation).map(item => item.to)).toEqual(['/posts', '/categories', '/tags', '/archive', '/series', '/my', '/tools', '/about'])
  expect(resolveNavigation(config.site.navigation, context('series', '/series'))[1]).toMatchObject({ label: '系列', active: true, current: 'page' })
  expect(resolveNavigation(config.site.navigation, context('archive', '/archive'))[1]).toMatchObject({ label: '归档', active: true, current: 'page' })
  expect(resolveNavigation(config.site.navigation, context('tags', '/tags/C%23'))[1]).toMatchObject({ label: '标签', active: true, current: 'location' })
  const app = createSSRApp(SiteDirectory, { items: my.children })
  app.component('NuxtLink', NuxtLink)
  const html = await renderToString(app)
  expect(html).toContain('href="/tools"')
  expect(html).toContain(my.children[0]!.description)
  expect(html).not.toContain('/projects')
  expect(html).not.toContain('/collections')
})

test('修改同一配置项的名称、图标、地址与启用状态后命令同步更新，卸载后不残留入口', async () => {
  const config = ref(structuredClone(navigation))
  const destinations = computed(() => navigationDestinations(config.value))
  const palette = createCommandController(() => ({ search: true, commands: true }))
  const navigate = vi.fn()
  const scope = effectScope()
  cleanups.push(() => scope.stop())
  scope.run(() => useNavigationCommands(destinations, palette.register, navigate))
  const home = config.value[0]!
  if (home.kind !== 'link')
    throw new Error('首页应为普通链接')
  home.label = '文章列表'
  home.icon = 'list'
  home.to = '/posts/updated'
  await flush()
  const commands = palette.commands.value
  expect(commands.find(item => item.id === 'navigate:home')).toMatchObject({ label: '前往文章列表', icon: 'list', keywords: ['posts', '/posts/updated'] })
  expect(new Set(commands.map(item => item.id)).size).toBe(commands.length)
  await commands.find(item => item.id === 'navigate:home')!.execute()
  expect(navigate).toHaveBeenCalledWith('/posts/updated')
  home.enabled = false
  await flush()
  expect(palette.commands.value.some(item => item.id === 'navigate:home')).toBe(false)
  home.enabled = true
  await flush()
  expect(palette.commands.value.filter(item => item.id === 'navigate:home')).toHaveLength(1)
  scope.stop()
  expect(palette.commands.value).toEqual([])
})

test('移动导航 SSR 与水合保持展开状态和唯一控制区域，初始折叠也有有效关联', async () => {
  const props = { items: resolveNavigation(navigation, context('my', '/my')), open: true }
  const create = () => {
    const app = createSSRApp(SiteMobileNavigation, props)
    app.component('NuxtLink', NuxtLink)
    return app
  }
  const host = document.createElement('div')
  host.innerHTML = await renderToString(create())
  document.body.append(host)
  const controls = buttons(host).map(button => button.getAttribute('aria-controls'))
  expect(new Set(controls).size).toBe(2)
  for (const id of controls) expect(document.getElementById(id!)).not.toBeNull()
  const warn = vi.spyOn(console, 'warn')
  const error = vi.spyOn(console, 'error')
  const app = create()
  cleanups.push(() => {
    app.unmount()
    host.remove()
  })
  app.mount(host)
  await flush()
  expect(buttons(host).map(button => button.getAttribute('aria-controls'))).toEqual(controls)
  expect(buttons(host).map(button => button.getAttribute('aria-expanded'))).toEqual(['false', 'true'])
  expect(warn).not.toHaveBeenCalled()
  expect(error).not.toHaveBeenCalled()
})
