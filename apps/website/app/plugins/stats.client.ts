import { recordedSchema } from '#shared/stats/model'
import { createPageviewTracker, ensureVisitorCookie } from '~/features/stats/tracker'

export default defineNuxtPlugin((nuxtApp) => {
  const stats = useVisitStats()
  const config = useRuntimeConfig()
  const error = useError()
  let mounted = false
  const tracker = createPageviewTracker({
    makeId: () => crypto.randomUUID(),
    wait: () => new Promise(resolve => setTimeout(resolve, 800)),
    async send(event) {
      ensureVisitorCookie(document, config.app.baseURL, location.protocol === 'https:', () => crypto.randomUUID())
      return recordedSchema.parse(await $fetch(stats.endpoint('pageview'), {
        method: 'POST',
        body: event,
        retry: 0,
        timeout: 5000,
        keepalive: true,
      }))
    },
    publish: stats.accept,
    fail: stats.fail,
  })
  async function complete(force = false) {
    const route = nuxtApp.$router.currentRoute.value
    if (route.path === '/admin' || route.path.startsWith('/admin/') || route.path.startsWith('/api/')) {
      tracker.leave()
      return
    }
    if (mounted && !error.value && route.matched.length && route.path !== '/') {
      const enabled = await stats.refreshSettings()
      if (nuxtApp.$router.currentRoute.value.path !== route.path || error.value)
        return
      if (enabled)
        void tracker.open(route.path, force)
      else tracker.leave()
    }
  }
  nuxtApp.hook('app:mounted', () => {
    mounted = true
    complete()
  })
  nuxtApp.hook('page:loading:end', () => {
    void nextTick(() => complete())
  })
  nuxtApp.hook('app:error', () => tracker.leave())
  const restore = (event: PageTransitionEvent) => {
    if (event.persisted)
      complete(true)
  }
  window.addEventListener('pageshow', restore)
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      tracker.stop()
      window.removeEventListener('pageshow', restore)
    })
  }
})
