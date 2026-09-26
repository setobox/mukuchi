// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import BaseCollapsible from '../app/components/base/BaseCollapsible.vue'
import { restoreCollapsedHash, withCollapsibleAnchors } from '../app/features/collapse/navigation'

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).reverse().forEach(close => close())
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.resetModules()
})
const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: {} }] })
const from = router.resolve('/posts')
const to = router.resolve('/posts/test#%E9%9A%90%E8%97%8F%E6%A0%87%E9%A2%98')
function content() {
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({ render: () => h(BaseCollapsible, {}, {
    trigger: () => h('button', '展开'),
    default: () => h('h2', { id: '隐藏标题' }, '标题'),
  }) })
  app.mount(host)
  cleanups.push(() => {
    app.unmount()
    host.remove()
  })
  return host
}

test('直接锚点等待水合，跨页等待原有滚动流程，再返回已展开的真实目标', async () => {
  let mounted!: () => void
  let loaded!: () => void
  const ready = new Promise<void>((resolve) => {
    mounted = resolve
  })
  const original = vi.fn(() => new Promise<false>((resolve) => {
    loaded = () => resolve(false)
  }))
  const scroll = withCollapsibleAnchors(original, () => true, () => ready)
  const pending = scroll(to, from, null)
  expect(original).not.toHaveBeenCalled()
  mounted()
  await Promise.resolve()
  expect(original).toHaveBeenCalledOnce()
  const host = content()
  loaded()
  // Explicit opt-out from the original router remains an opt-out.
  await expect(pending).resolves.toBe(false)
  expect(host.querySelector('button')!.getAttribute('aria-expanded')).toBe('true')
  const withPosition = withCollapsibleAnchors(() => ({ el: to.hash }), () => true, async () => {})
  await expect(withPosition(to, from, null)).resolves.toMatchObject({ el: host.querySelector('h2'), behavior: 'instant' })
})

test('保留历史位置和普通页面行为，导航被替换后不展开旧页面', async () => {
  const host = content()
  const saved = { left: 0, top: 480 }
  const history = withCollapsibleAnchors(() => saved, () => true, async () => {})
  await expect(history(to, from, saved)).resolves.toBe(saved)
  const plain = withCollapsibleAnchors(() => saved, () => true, async () => {})
  await expect(plain(from, to, null)).resolves.toBe(saved)
  cleanups.pop()!()
  const next = content()
  const stale = withCollapsibleAnchors(() => ({ el: to.hash }), () => false, async () => {})
  await expect(stale(to, from, null)).resolves.toBe(false)
  expect(next.querySelector('button')!.getAttribute('aria-expanded')).toBe('false')
  expect(host.isConnected).toBe(false)
})

test('首屏水合后补偿初始滚动：先展开再滚动，用户已离开时不抢回位置', async () => {
  const host = content()
  const heading = host.querySelector('h2')!
  const scroll = vi.spyOn(heading, 'scrollIntoView').mockImplementation(() => {
    expect(heading.closest('[inert]')).toBeNull()
  })
  await expect(restoreCollapsedHash(to.hash, () => true)).resolves.toBe(true)
  expect(scroll).toHaveBeenCalledOnce()
  await expect(restoreCollapsedHash(to.hash, () => true)).resolves.toBe(false)
  expect(scroll).toHaveBeenCalledOnce()
  cleanups.pop()!()
  const next = content()
  const cancelled = vi.spyOn(next.querySelector('h2')!, 'scrollIntoView')
  await expect(restoreCollapsedHash(to.hash, () => false)).resolves.toBe(false)
  expect(cancelled).not.toHaveBeenCalled()
})

test('Nuxt 初始化完成后安装滚动增强，再次点击同一锚点仍会展开', async () => {
  const host = content()
  const hooks = new Map<string, (() => unknown)[]>()
  const app = {
    $router: router,
    isHydrating: false,
    hook: (name: string, callback: () => unknown) => hooks.set(name, [...hooks.get(name) ?? [], callback]),
  }
  router.currentRoute.value = to
  const original = vi.fn(() => ({ el: to.hash }))
  const previous = router.options.scrollBehavior
  cleanups.push(() => {
    router.options.scrollBehavior = previous
  })
  app.hook('app:created', () => {
    router.options.scrollBehavior = original
  })
  vi.stubGlobal('defineNuxtPlugin', (initialize: (context: typeof app) => unknown) => initialize(app))
  await import('../app/plugins/content-anchors.client')
  for (const hook of hooks.get('app:created') ?? []) await hook()
  const scroll = router.options.scrollBehavior!
  await expect(scroll(to, to, null)).resolves.toMatchObject({ el: host.querySelector('h2') })
  expect(original).toHaveBeenCalledOnce()
  const trigger = host.querySelector('button')!
  expect(trigger.getAttribute('aria-expanded')).toBe('true')
  trigger.click()
  await expect(scroll(to, to, null)).resolves.toMatchObject({ el: host.querySelector('h2') })
  expect(trigger.getAttribute('aria-expanded')).toBe('true')
})
