import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite-plus'

// Nuxt owns the application build; this file configures only Vite+ unit tests.
export default defineConfig({
  plugins: [vue()],
  resolve: { alias: {
    '#shared': fileURLToPath(new URL('./shared', import.meta.url)),
    '~': fileURLToPath(new URL('./app', import.meta.url)),
    '#app': fileURLToPath(new URL('./tests/fixtures/nuxt-runtime.ts', import.meta.url)),
    '#github-snapshots': fileURLToPath(new URL('./tests/fixtures/github-snapshots.ts', import.meta.url)),
  } },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
})
