export default defineNuxtConfig({
  compatibilityDate: "2026-09-13",
  modules: ["@unocss/nuxt", "@vueuse/nuxt", "@nuxt/eslint"],
  components: [{ path: "~/components", pathPrefix: false }],
  css: ["~/assets/css/main.css"],
  devtools: { enabled: false },
  typescript: { strict: true },
  app: {
    head: {
      htmlAttrs: { lang: "zh-CN", class: "dark" },
      title: "mukuchi",
      meta: [
        { name: "description", content: "个人博客，提供文章阅读、专栏分类和工具入口。" },
        { name: "theme-color", content: "#252423" },
      ],
      link: [{ rel: "icon", type: "image/svg+xml", href: "/mukuchi.svg" }],
    },
  },
  routeRules: { "/": { redirect: { to: "/posts", statusCode: 302 } } },
  eslint: {
    config: {
      standalone: false,
    },
  },
});
