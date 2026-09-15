import { defineConfig } from 'vite-plus'

// Task execution only. Nuxt owns Vite's application configuration.
export default defineConfig({
  run: {
    tasks: {
      'build': {
        command: 'nuxt build',
        cache: false,
      },
      'build:cloudflare': {
        command: 'nuxt build --preset cloudflare_module',
        cache: false,
      },
      'preview:cloudflare': {
        command: 'wrangler dev --config .output/server/wrangler.json --port 8787',
        cache: false,
      },
      'deploy:cloudflare': {
        command: ['node scripts/check-release.ts', 'wrangler deploy --config .output/server/wrangler.json'],
        cache: false,
      },
      'smoke': {
        command: 'node scripts/smoke.ts',
        cache: false,
      },
    },
  },
})
