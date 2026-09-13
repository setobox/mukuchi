// @ts-check
import antfu from "@antfu/eslint-config";
import nuxt from "./apps/website/.nuxt/eslint.config.mjs";

export default antfu({
  unocss: true,
  formatters: true,
  pnpm: true,
  markdown: false,
}).append(nuxt());
