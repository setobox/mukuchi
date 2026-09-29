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
  const current = ref<SessionInfo>({ ...emptySession(), providers: { github: true, google: true }, linkedProviders: ['github'], loginProvider: role ? 'github' : null, user: role ? { id: 'user', name: '测试用户', email: 'user@example.com', avatar: 'https://example.com/avatar.png', role, local: false } : null })
  const auth = { current, loaded: ref(true), loading: ref(false), busy: ref(false), error: ref(''), loginOpen: ref(false), refresh: vi.fn(), logout: vi.fn(async () => {
    current.value = { ...current.value, user: null }
  }), loginUrl: vi.fn(() => '/api/auth/github?returnTo=%2Fposts'), linkGoogle: vi.fn(async () => ({ url: 'https://accounts.google.com/' })), sendCode: vi.fn(), verifyCode: vi.fn(async () => ({ returnTo: '/posts' })) }
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
test('未登录打开登录弹窗，展示两平台与首次注册提示，关闭恢复焦点', async () => {
  const { button, dialog, auth, navigate } = mount()
  button().focus()
  button().click()
  await flush()
  expect(dialog.open).toBe(true)
  expect(dialog.textContent).toContain('首次登录将自动注册')
  const github = [...dialog.querySelectorAll('button')].find(item => item.textContent?.includes('使用 GitHub'))!
  expect(dialog.textContent).toContain('使用 Google 登录')
  github.click()
  await flush()
  expect(auth.loginUrl).toHaveBeenCalledWith('github', '/posts')
  expect(navigate).toHaveBeenCalledWith('/api/auth/github?returnTo=%2Fposts', { external: true })
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
  expect(button().getAttribute('aria-label')).toContain('GitHub')
  expect(button().querySelector('.i-lucide-github')).not.toBeNull()
  expect(menu.textContent).not.toContain('前往后台')
  expect(menu.textContent).toContain('退出登录')
  expect(menu.textContent).toContain('关联 Google')
  const avatar = button().querySelector('img')!
  avatar.dispatchEvent(new Event('error'))
  await flush()
  expect(button().querySelector('img')).toBeNull()
  key(menu, 'Escape')
  await vi.waitFor(() => expect(document.querySelector('[role="menu"]')).toBeNull())
  await vi.waitFor(() => expect(document.activeElement).toBe(button()))
})
test('切换登录平台后导航徽标显示 Google', async () => {
  const { auth, button } = mount('user')
  auth.current.value.loginProvider = 'google'
  await flush()
  expect(button().getAttribute('aria-label')).toContain('Google')
  expect(button().querySelector('.i-logos-google-icon')).not.toBeNull()
})
test('管理员菜单支持键盘选择，后台退出后返回文章列表', async () => {
  const { auth, openMenu, navigate } = mount('admin', '/admin')
  const menu = await openMenu()
  expect(menu.textContent).toContain('前往后台')
  const items = [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')]
  const logout = items.find(item => item.textContent?.includes('退出登录'))!
  logout.focus()
  key(logout, 'Enter')
  await vi.waitFor(() => expect(auth.logout).toHaveBeenCalledOnce())
  expect(navigate).toHaveBeenCalledWith('/posts')
})
test('验证邮件步骤支持验证码输入、冷却、重发与错误提示；已绑定 Google 隐藏关联入口', async () => {
  const { auth, dialog, openMenu } = mount('user')
  auth.current.value.linkedProviders = ['github', 'google']
  const menu = await openMenu()
  expect(menu.textContent).not.toContain('关联 Google')
  key(menu, 'Escape')
  auth.current.value.user = null
  auth.current.value.pendingVerification = { email: 'new@qq.com', expiresAt: Date.now() + 600_000, resendAfter: Date.now() + 60_000, csrf: 'pending' }
  auth.loginOpen.value = true
  await flush()
  expect(dialog.textContent).toContain('new@qq.com')
  const resend = [...dialog.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.includes('重新发送'))!
  expect(resend.disabled).toBe(true)
  auth.current.value.pendingVerification.resendAfter = 0
  await flush()
  resend.click()
  expect(auth.sendCode).toHaveBeenCalledOnce()
  auth.error.value = '验证码错误'
  await flush()
  expect(dialog.querySelector('[role="alert"]')?.textContent).toContain('验证码错误')
  const input = dialog.querySelector('input')!
  input.value = '123456'
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await flush()
  dialog.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }))
  await vi.waitFor(() => expect(auth.verifyCode).toHaveBeenCalledWith('123456'))
})
