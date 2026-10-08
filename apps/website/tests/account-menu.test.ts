// @vitest-environment happy-dom
import type { SessionInfo } from '../shared/auth/model'
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { createApp, defineComponent, h, nextTick, reactive, ref } from 'vue'
import AppIcon from '../app/components/AppIcon.vue'
import AccountAvatar from '../app/components/auth/AccountAvatar.vue'
import AccountMenu from '../app/components/auth/AccountMenu.vue'
import LoginDialog from '../app/components/auth/LoginDialog.vue'
import AcrylicDialog from '../app/components/base/AcrylicDialog.vue'
import BaseButton from '../app/components/base/BaseButton.vue'
import BaseUiProvider from '../app/components/base/BaseUiProvider.vue'
import { emptySession } from '../shared/auth/model'

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
function key(target: Element, value: string) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }))
}
function mount(role?: 'admin' | 'user', path = '/posts') {
  vi.spyOn(window, 'matchMedia').mockImplementation(query => ({ matches: query.includes('prefers-reduced-motion'), media: query, onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: () => true }))
  const current = ref<SessionInfo>({ ...emptySession(), ssoAvailable: true, ssoLinked: false, centralLogoutAvailable: true, csrf: 'csrf', loginProvider: role ? 'sso' : null, user: role ? { id: 'user', name: '测试用户', email: 'user@example.com', avatar: 'https://example.com/avatar.png', role, local: false } : null })
  const auth = { current, loaded: ref(true), loading: ref(false), busy: ref(false), error: ref(''), loginOpen: ref(false), refresh: vi.fn(), logout: vi.fn(async () => {
    current.value = { ...current.value, user: null }
  }), loginUrl: vi.fn(() => '/api/auth/sso/login?returnTo=%2Fposts'), linkSso: vi.fn(async () => ({ url: 'https://id.seto.box/' })), endpoint: (path: string) => path }
  const route = reactive({ path, fullPath: path, query: {} as Record<string, string>, hash: '' })
  const navigate = vi.fn()
  vi.stubGlobal('useAuthSession', () => auth)
  vi.stubGlobal('useRoute', () => route)
  vi.stubGlobal('useRouter', () => ({ replace: vi.fn() }))
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { authEnabled: true } }))
  vi.stubGlobal('navigateTo', navigate)
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({ render: () => h(BaseUiProvider, null, { default: () => h(AccountMenu) }) })
  app.component('LoginDialog', LoginDialog).component('AccountAvatar', AccountAvatar).component('AcrylicDialog', AcrylicDialog).component('BaseButton', BaseButton).component('AppIcon', AppIcon)
  app.component('NuxtLink', defineComponent({ props: { to: String }, setup: (props, { slots }) => () => h('a', { href: props.to }, slots.default?.()) }))
  app.mount(host)
  const dialog = document.querySelector<HTMLDialogElement>('dialog')!
  vi.spyOn(dialog, 'showModal').mockImplementation(() => {
    dialog.open = true
  })
  vi.spyOn(dialog, 'close').mockImplementation(() => {
    dialog.open = false
  })
  cleanups.push(() => {
    app.unmount()
    host.remove()
  })
  const button = () => host.querySelector<HTMLButtonElement>('button')!
  async function openMenu() {
    button().focus()
    key(button(), 'ArrowDown')
    await vi.waitFor(() => expect(document.querySelector('[role="menu"]')).not.toBeNull())
    return document.querySelector<HTMLElement>('[role="menu"]')!
  }
  return { host, auth, route, navigate, dialog, button, openMenu }
}
test('未登录打开登录弹窗，展示统一账号与注册提示，关闭恢复焦点', async () => {
  const { button, dialog, auth, navigate } = mount()
  button().focus()
  button().click()
  await flush()
  expect(dialog.open).toBe(true)
  expect(dialog.textContent).toContain('注册与账号资料由账号中心管理')
  const github = [...dialog.querySelectorAll('button')].find(item => item.textContent?.includes('使用 MU³ ID'))!
  expect(dialog.textContent).toContain('使用 MU³ ID 登录')
  github.click()
  await flush()
  expect(auth.loginUrl).toHaveBeenCalledWith('/posts')
  expect(navigate).toHaveBeenCalledWith('/api/auth/sso/login?returnTo=%2Fposts', { external: true })
  dialog.dispatchEvent(new Event('cancel', { cancelable: true }))
  await flush()
  expect(dialog.open).toBe(false)
  expect(document.activeElement).toBe(button())
})
test('已登录菜单无头像，导航头像显示登录平台，Esc 返回触发器', async () => {
  const { button, dialog, openMenu } = mount('user')
  const menu = await openMenu()
  expect(dialog.open).toBe(false)
  expect(menu.textContent).toContain('user@example.com')
  expect(menu.querySelector('img')).toBeNull()
  expect(button().getAttribute('aria-label')).toContain('MU³ ID')
  expect(button().querySelector('.i-lucide-circle-user-round')).not.toBeNull()
  expect(menu.textContent).not.toContain('前往后台')
  expect(menu.textContent).toContain('退出本站')
  expect(menu.textContent).toContain('绑定 MU³ ID')
  const avatar = button().querySelector('img')!
  avatar.dispatchEvent(new Event('error'))
  await flush()
  expect(button().querySelector('img')).toBeNull()
  key(menu, 'Escape')
  await vi.waitFor(() => expect(document.querySelector('[role="menu"]')).toBeNull())
  await vi.waitFor(() => expect(document.activeElement).toBe(button()))
})
test('本地会话不显示登录平台徽标', async () => {
  const { auth, button } = mount('user')
  auth.current.value.loginProvider = null
  await flush()
  expect(button().getAttribute('aria-label')).toBe('账号菜单')
  expect(button().querySelector('.i-lucide-circle-user-round')).toBeNull()
})
test('管理员菜单支持键盘选择，后台退出后返回文章列表', async () => {
  const { auth, openMenu, navigate } = mount('admin', '/admin')
  const menu = await openMenu()
  expect(menu.textContent).toContain('前往后台')
  const items = [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')]
  const logout = items.find(item => item.textContent?.includes('退出本站'))!
  logout.focus()
  key(logout, 'Enter')
  await vi.waitFor(() => expect(auth.logout).toHaveBeenCalledOnce())
  expect(navigate).toHaveBeenCalledWith('/posts')
})
test('已绑定账号隐藏绑定入口，并提供带 CSRF 的原生账号中心退出表单', async () => {
  const { auth, openMenu } = mount('user')
  auth.current.value.ssoLinked = true
  const menu = await openMenu()
  expect(menu.textContent).not.toContain('绑定 MU³ ID')
  expect(menu.querySelector('a[href="https://id.seto.box/account"]')).not.toBeNull()
  const form = menu.querySelector('form')!
  expect(form.method).toBe('post')
  expect(form.getAttribute('action')).toBe('/api/auth/logout')
  expect(form.querySelector<HTMLInputElement>('[name="csrf"]')!.value).toBe('csrf')
  expect(form.querySelector<HTMLInputElement>('[name="scope"]')!.value).toBe('central')
  expect(form.textContent).toContain('同时退出账号中心')
  const submit = vi.fn((event: Event) => event.preventDefault())
  form.addEventListener('submit', submit)
  form.querySelector('button')!.click()
  expect(submit).toHaveBeenCalledOnce()
})

test('原账号通过显式绑定入口前往账号中心', async () => {
  const { auth, openMenu, navigate } = mount('user')
  const menu = await openMenu()
  const link = [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(item => item.textContent?.includes('绑定 MU³ ID'))!
  link.click()
  await vi.waitFor(() => expect(auth.linkSso).toHaveBeenCalledWith('/posts'))
  expect(navigate).toHaveBeenCalledWith('https://id.seto.box/', { external: true })
})
