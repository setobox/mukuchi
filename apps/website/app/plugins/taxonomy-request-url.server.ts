export default defineNuxtPlugin({
  name: 'taxonomy-request-url',
  // Run before nuxt:router. Nuxt 4.5.2's SSR encodePath escapes %25 again.
  // Preserve the request URL so Router decodes taxonomy names exactly once,
  // and hydration starts from the same path as the address bar.
  order: -30,
  setup(nuxtApp) {
    const context = nuxtApp.ssrContext
    if (!context || context.error)
      return
    const path = context.event.node.req.url
    if (path && /^\/(?:categories|tags)\/[^/?]+\/?(?:\?|$)/.test(path)) {
      context.url = path
      nuxtApp.payload.path = path
    }
  },
})
