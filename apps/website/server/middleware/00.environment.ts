import process from 'node:process'
import { resolveWebsiteEnvironment } from '../../shared/config/environment'
import { oidcSettings } from '../features/auth/settings'

export default defineEventHandler((event) => {
  const config = useRuntimeConfig(event)
  event.context.nitro.runtimeConfig = resolveWebsiteEnvironment(config, process.env, event.context.cloudflare?.env, import.meta.prerender)
  // Nitro logs and swallows request-hook errors. Middleware must enforce validation.
  if (!import.meta.prerender && import.meta.preset?.includes('cloudflare'))
    oidcSettings(event)
})
