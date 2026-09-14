// @ts-check
import antfu from "@antfu/eslint-config";
import nuxt from "./apps/website/.nuxt/eslint.config.mjs";

export default antfu({
  vue: true,
  typescript: true,
  // Vite+ owns formatting. ESLint checks Vue/Nuxt semantics and UnoCSS.
  stylistic: false,
  unocss: true,
  formatters: false,
  pnpm: true,
  markdown: false,
  rules: { "jsonc/sort-keys": "off" },
}).append(nuxt(), {
  name: "mukuchi/formatting-owned-by-vite-plus",
  rules: {
    "vue/html-closing-bracket-newline": "off",
    "vue/singleline-html-element-content-newline": "off",
    "vue/multiline-html-element-content-newline": "off",
    "vue/html-self-closing": "off",
  },
});
