// SSR component tests only replace the Nuxt runtime configuration boundary.
export const useRuntimeConfig = () => ({ app: { baseURL: '/' } })
export function useRoute() {
  return { path: '/posts/test' }
}
