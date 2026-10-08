import { oidcSettings } from '../features/auth/settings'

export default defineNitroPlugin((nitro) => {
  // Prerender has no account traffic or runtime secrets. Workers receive bindings
  // with each request, whereas the Node server can validate before listening.
  if (import.meta.prerender)
    return
  if (import.meta.preset?.includes('cloudflare')) {
    nitro.hooks.hook('request', (event) => {
      oidcSettings(event)
    })
    return
  }
  const config = useRuntimeConfig()
  // An unconfigured local checkout still supports the existing loopback admin.
  if (!import.meta.dev || config.oidcClientId || config.oidcClientSecret)
    oidcSettings()
})
