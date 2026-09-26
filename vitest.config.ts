import { defineConfig } from 'vite-plus'

export default defineConfig({
  test: {
    projects: [
      './apps/website/vitest.config.ts',
      './packages/utils/vite.config.ts',
    ],
  },
})
