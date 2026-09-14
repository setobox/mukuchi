import { defineConfig } from 'vite-plus'

export default defineConfig({
  staged: {
    '*': 'eslint --fix --no-warn-ignored',
  },
  check: {
    fmt: false,
    lint: false,
  },
  run: {
    cache: true,
  },
})
