import type { SessionInfo } from '#shared/admin/model'

export function useAdminSession() {
  const current = useState<SessionInfo>('admin:session', () => ({ user: null, csrf: null, localAvailable: false, loginAvailable: false }))
  const loaded = useState('admin:session-loaded', () => false)
  const base = useRuntimeConfig().app.baseURL.replace(/\/$/, '')
  const endpoint = (path: string) => `${base}${path}`
  async function refresh() {
    try {
      current.value = await $fetch<SessionInfo>(endpoint('/api/auth/session'))
    }
    catch { current.value = { user: null, csrf: null, localAvailable: false, loginAvailable: false } }
    loaded.value = true
  }
  async function localLogin() {
    await $fetch(endpoint('/api/auth/local'), { method: 'POST', headers: { 'x-admin-request': '1' } })
    await refresh()
  }
  async function logout() {
    await $fetch(endpoint('/api/auth/logout'), { method: 'POST', headers: { 'x-csrf-token': current.value.csrf ?? '' } })
    await refresh()
  }
  async function request<T>(path: string, options: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE', body?: object } = {}): Promise<T> {
    return await $fetch<T>(endpoint(`/api/admin/${path}`), { ...options, headers: { 'x-csrf-token': current.value.csrf ?? '' }, retry: 0 }) as T
  }
  return { current, loaded, refresh, localLogin, logout, request, endpoint }
}
export function adminError(error: unknown) {
  if (error && typeof error === 'object' && 'data' in error && error.data && typeof error.data === 'object' && 'message' in error.data && typeof error.data.message === 'string')
    return error.data.message
  return '操作失败，请检查连接后重试'
}
