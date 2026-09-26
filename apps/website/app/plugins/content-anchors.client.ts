import { nextTick } from 'vue'
import { restoreCollapsedHash, withCollapsibleAnchors } from '~/features/collapse/navigation'

export default defineNuxtPlugin((nuxtApp) => {
  const router = nuxtApp.$router
  const hydrated = nuxtApp.isHydrating
    ? new Promise<void>(resolve => nuxtApp.hook('app:suspense:resolve', () => resolve()))
    : Promise.resolve()
  // Nuxt replaces its initial scroll handler during app:created.
  nuxtApp.hook('app:created', () => {
    router.options.scrollBehavior = withCollapsibleAnchors(
      router.options.scrollBehavior,
      fullPath => router.currentRoute.value.fullPath === fullPath,
      () => hydrated,
    )
  })
  nuxtApp.hook('app:suspense:resolve', async () => {
    await nextTick()
    const route = router.currentRoute.value
    await restoreCollapsedHash(route.hash, () => router.currentRoute.value.fullPath === route.fullPath)
  })
})
