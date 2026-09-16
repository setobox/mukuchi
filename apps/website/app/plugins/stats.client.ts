import { recordedSchema } from '#shared/stats/model'
import { createPageviewTracker, ensureVisitorCookie } from '~/features/stats/tracker'

export default defineNuxtPlugin((nuxtApp) => {
  const stats = useVisitStats()
  if (!stats.enabled)
    return
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
  function complete(force = false) {
    const route = nuxtApp.$router.currentRoute.value
    if (mounted && !error.value && route.matched.length && route.path !== '/')
      void tracker.open(route.path, force)
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
