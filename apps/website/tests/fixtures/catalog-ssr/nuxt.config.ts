import { fileURLToPath } from 'node:url'

export default defineNuxtConfig({
  compatibilityDate: '2026-09-13',
  devtools: { enabled: false },
  alias: { '#shared': fileURLToPath(new URL('../../../shared', import.meta.url)) },
  imports: { dirs: [fileURLToPath(new URL('../../../app/composables/usePostCatalog.ts', import.meta.url))] },
  nitro: { preset: 'node-server' },
})
