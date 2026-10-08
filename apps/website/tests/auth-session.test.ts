import type { SessionInfo } from '../shared/auth/model'
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test'
import { ref } from 'vue'
import { useAuthSession } from '../app/composables/useAuthSession'
import { emptySession } from '../shared/auth/model'

const fetcher = vi.fn()
beforeEach(() => {
  const values = new Map<string, ReturnType<typeof ref>>()
  vi.stubGlobal('useState', (key: string, init: () => unknown) => {
    if (!values.has(key))
      values.set(key, ref(init()))
    return values.get(key)
  })
  vi.stubGlobal('useRuntimeConfig', () => ({ app: { baseURL: '/blog/' } }))
  vi.stubGlobal('$fetch', fetcher)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetAllMocks()
})
const signed: SessionInfo = { ...emptySession(), user: { id: 'id', name: 'name', avatar: '', email: 'user@example.com', role: 'user', local: false }, csrf: 'csrf', ssoAvailable: true }
test('共享会话；网络错误保留现有用户并显示重试错误，实际退出立即清除', async () => {
  fetcher.mockResolvedValueOnce(signed)
  const auth = useAuthSession()
  await auth.refresh()
  expect(useAuthSession().current.value.user).toEqual(signed.user)
  fetcher.mockRejectedValueOnce(new Error('offline'))
  expect(await auth.refresh()).toBe(false)
  expect(auth.current.value.user).toEqual(signed.user)
  expect(auth.error.value).toBeTruthy()
  fetcher.mockResolvedValueOnce({ ok: true })
  await auth.logout()
  expect(auth.current.value.user).toBeNull()
  expect(fetcher).toHaveBeenLastCalledWith('/blog/api/auth/logout', expect.objectContaining({ headers: { 'x-csrf-token': 'csrf' } }))
  expect(auth.loginUrl('/posts?q=1#h')).toContain('returnTo=%2Fblog%2Fposts%3Fq%3D1%23h')
})
test('退出时仍在途的会话响应不能恢复已撤销的用户，重复操作被阻止', async () => {
  const auth = useAuthSession()
  auth.current.value = signed
  let resolveRefresh: (value: SessionInfo) => void = () => {}
  fetcher.mockReturnValueOnce(new Promise<SessionInfo>(resolve => resolveRefresh = resolve)).mockResolvedValueOnce({ ok: true })
  const refreshing = auth.refresh()
  const exiting = auth.logout()
  await expect(auth.logout()).rejects.toThrow()
  await exiting
  resolveRefresh(signed)
  await refreshing
  expect(auth.current.value.user).toBeNull()
  expect(auth.loading.value).toBe(false)
})

test('在途会话刷新不会清除后来设置的登录回调错误，主动重试仍可清除', async () => {
  const auth = useAuthSession()
  let resolveRefresh: (value: SessionInfo) => void = () => {}
  fetcher.mockReturnValueOnce(new Promise<SessionInfo>(resolve => resolveRefresh = resolve))
  const refreshing = auth.refresh()
  auth.error.value = '已取消授权，可以重新登录'
  resolveRefresh(emptySession())
  await refreshing
  expect(auth.error.value).toBe('已取消授权，可以重新登录')
  fetcher.mockResolvedValueOnce(emptySession())
  await auth.refresh()
  expect(auth.error.value).toBe('')
})
