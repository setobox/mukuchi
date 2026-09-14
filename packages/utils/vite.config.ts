import { defineConfig } from 'vite-plus'

export default defineConfig({
  pack: {
    dts: {
      tsgo: false,
    },
    exports: true,
  },
  check: {
    fmt: false,
    lint: false,
  },
})
