import process from 'node:process'
import { resolveWebsiteEnvironment } from '../../shared/config/environment'
import { parseOidcSettings } from '../features/auth/settings'

export default defineNitroPlugin(() => {
  // Prerender has no account traffic or runtime secrets. Workers receive bindings
  // with each request, whereas the Node server can validate before listening.
  if (import.meta.prerender || import.meta.preset?.includes('cloudflare'))
    return
  const config = resolveWebsiteEnvironment(useRuntimeConfig(), process.env)
  // An unconfigured local checkout still supports the existing loopback admin.
  if (!import.meta.dev || config.oidcClientId || config.oidcClientSecret)
    parseOidcSettings(config, import.meta.dev, config.app.baseURL)
})
