import type { AuthProvider, SessionInfo } from '#shared/auth/model'
import { emptySession } from '#shared/auth/model'

export function authError(error: unknown) {
  if (error && typeof error === 'object' && 'data' in error && error.data && typeof error.data === 'object' && 'message' in error.data && typeof error.data.message === 'string')
    return error.data.message
  return '操作失败，请检查连接后重试'
}
export function useAuthSession() {
  const current = useState<SessionInfo>('auth:session', emptySession)
  const loaded = useState('auth:loaded', () => false)
  const loading = useState('auth:loading', () => false)
  const busy = useState('auth:busy', () => false)
  const error = useState('auth:error', () => '')
  const revision = useState('auth:revision', () => 0)
  const loginOpen = useState('auth:login-open', () => false)
  const base = useRuntimeConfig().app.baseURL.replace(/\/$/, '')
  const endpoint = (path: string) => `${base}${path}`
  async function refresh() {
    const request = ++revision.value
    loading.value = true
    try {
      const value = await $fetch<SessionInfo>(endpoint('/api/auth/session'))
      if (request === revision.value) {
        current.value = value
        error.value = ''
      }
      return true
    }
    catch (cause) {
      if (request === revision.value)
        error.value = authError(cause)
      return false
    }
    finally {
      if (request === revision.value) {
        loading.value = false
        loaded.value = true
      }
    }
  }
  async function perform<T>(action: () => Promise<T>) {
    if (busy.value)
      throw new Error('Account operation in progress')
    busy.value = true
    error.value = ''
    try {
      return await action()
    }
    catch (cause) {
      error.value = authError(cause)
      throw cause
    }
    finally { busy.value = false }
  }
  async function logout() {
    await perform(async () => {
      await $fetch(endpoint('/api/auth/logout'), { method: 'POST', headers: { 'x-csrf-token': current.value.csrf ?? '' }, retry: 0 })
      revision.value++
      loading.value = false
      current.value = { ...emptySession(), providers: current.value.providers, localAvailable: current.value.localAvailable }
    })
  }
  async function localLogin() {
    await perform(async () => {
      await $fetch(endpoint('/api/auth/local'), { method: 'POST', headers: { 'x-admin-request': '1' }, retry: 0 })
      await refresh()
    })
  }
  function loginUrl(provider: AuthProvider, returnTo: string) {
    return `${endpoint(`/api/auth/${provider}`)}?${new URLSearchParams({ returnTo: `${base}${returnTo}` })}`
  }
  async function linkGoogle(returnTo: string) {
    return perform(() => $fetch<{ url: string }>(endpoint('/api/auth/link/google'), { method: 'POST', headers: { 'x-csrf-token': current.value.csrf ?? '' }, body: { returnTo: `${base}${returnTo}` }, retry: 0 }))
  }
  async function sendCode() {
    await perform(async () => {
      await $fetch(endpoint('/api/auth/email/send'), { method: 'POST', headers: { 'x-csrf-token': current.value.pendingVerification?.csrf ?? '' }, retry: 0 })
      await refresh()
    })
  }
  async function verifyCode(code: string) {
    return perform(async () => {
      const result = await $fetch<{ returnTo: string }>(endpoint('/api/auth/email/verify'), { method: 'POST', headers: { 'x-csrf-token': current.value.pendingVerification?.csrf ?? '' }, body: { code }, retry: 0 })
      await refresh()
      return result
    })
  }
  return { current, loaded, loading, busy, error, loginOpen, endpoint, refresh, logout, localLogin, loginUrl, linkGoogle, sendCode, verifyCode }
}
