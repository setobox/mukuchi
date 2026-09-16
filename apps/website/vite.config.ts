import { defineConfig } from 'vite-plus'

// Task execution only. Nuxt owns Vite's application configuration.
export default defineConfig({
  run: {
    tasks: {
      'build': {
        command: ['nuxt build', 'node scripts/finalize-stats-build.ts'],
        cache: false,
      },
      'build:cloudflare': {
        command: ['nuxt build --preset cloudflare_module', 'node scripts/finalize-stats-build.ts'],
        cache: false,
      },
      'preview:cloudflare': {
        command: 'wrangler dev --config .output/server/wrangler.json --port 8787 --persist-to .wrangler/state',
        cache: false,
      },
      'deploy:cloudflare': {
        command: ['node scripts/check-release.ts', 'node scripts/prepare-stats-release.ts', 'wrangler deploy --config .output/server/wrangler.json'],
        cache: false,
      },
      'smoke': {
        command: 'node scripts/smoke.ts',
        cache: false,
      },
      'stats:migrate': {
        command: 'node --import ./scripts/stats-environment.ts scripts/migrate-stats.ts',
        cache: false,
      },
      'stats:migrate:local': {
        command: 'wrangler d1 migrations apply mukuchi-stats --local --config wrangler.jsonc --persist-to .wrangler/state',
        cache: false,
      },
      'stats:smoke': {
        command: 'node scripts/smoke-stats.ts',
        cache: false,
      },
      'stats:check-build': {
        command: 'node scripts/check-stats-build.ts',
        cache: false,
      },
    },
  },
})
