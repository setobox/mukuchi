import { defineConfig } from "vite-plus";

// Nuxt owns the application build; this file configures only Vite+ unit tests.
export default defineConfig({
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
});
