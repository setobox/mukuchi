import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite-plus'

// Nuxt owns the application build; this file configures only Vite+ unit tests.
export default defineConfig({
  resolve: { alias: { '#shared': fileURLToPath(new URL('./shared', import.meta.url)) } },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
})
