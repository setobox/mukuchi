import { authError, useAuthSession } from './useAuthSession'

export function useAdminSession() {
  const auth = useAuthSession()
  const { current, endpoint } = auth
  async function request<T>(path: string, options: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE', body?: object } = {}): Promise<T> {
    return await $fetch<T>(endpoint(`/api/admin/${path}`), { ...options, headers: { 'x-csrf-token': current.value.csrf ?? '' }, retry: 0 }) as T
  }
  return { ...auth, request }
}
export const adminError = authError
