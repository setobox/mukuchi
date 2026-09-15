import githubSnapshots from './content/github/module'
import { validateContentDirectory, validateFrontmatter } from './content/validation.ts'
import { themeCookieBootstrap, themeCookieKey, themeCookieOptions } from './shared/theme/preference.ts'

export default defineNuxtConfig({
  compatibilityDate: '2026-09-13',
  modules: ['@nuxt/content', '@nuxtjs/color-mode', '@unocss/nuxt', '@vueuse/nuxt', '@nuxt/eslint', githubSnapshots],
  colorMode: {
    preference: 'system',
    fallback: 'dark',
    classSuffix: '',
    storage: 'cookie',
    storageKey: themeCookieKey,
    cookieAttrs: themeCookieOptions,
    disableTransition: true,
  },
  content: {
    experimental: { sqliteConnector: 'native' },
    build: { markdown: {
      contentHeading: false,
      toc: { depth: 5, searchDepth: 12 },
      highlight: { theme: { default: 'github-dark', light: 'github-light' } },
    } },
    renderer: { anchorLinks: { h2: true, h3: true, h4: true, h5: true, h6: true } },
  },
  hooks: {
    // Nuxt Content skips parse errors by default. Preflight every start/build,
    // including cached content, so invalid frontmatter cannot pass a build.
    'modules:before': validateContentDirectory,
    'vite:configResolved': (config) => {
      // Content's rewrite runs before MDC adds its entries. Correct them after
      // all module extensions so pnpm can resolve MDC through its direct parent.
      if (config.optimizeDeps?.include) {
        config.optimizeDeps.include = config.optimizeDeps.include.map(id =>
          id.replace(/^@nuxtjs\/mdc > /, '@nuxt/content > @nuxtjs/mdc > '),
        )
      }
    },
    'content:file:afterParse': ({ file, content, collection }) => {
      if (collection.name !== 'posts' && collection.name !== 'about')
        return
      Object.assign(content, validateFrontmatter(file.body, file.path, collection.name))
    },
  },
  components: [{ path: '~/components', pathPrefix: false }],
  css: ['~/assets/css/main.css'],
  devtools: { enabled: false },
  typescript: { strict: true },
  app: {
    head: {
      htmlAttrs: { lang: 'zh-CN' },
      script: [{ key: 'theme-cookie-guard', innerHTML: themeCookieBootstrap, tagPriority: 'critical' }],
      title: 'mukuchi',
      meta: [
        { name: 'description', content: '个人博客，提供文章阅读、专栏分类和工具入口。' },
        { name: 'theme-color', content: '#252423', media: '(prefers-color-scheme: dark)', key: 'theme-color-dark' },
        { name: 'theme-color', content: '#faf8f5', media: '(prefers-color-scheme: light)', key: 'theme-color-light' },
      ],
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/mukuchi.svg' }],
    },
  },
  routeRules: { '/': { redirect: { to: '/posts', statusCode: 302 } } },
  eslint: {
    config: {
      standalone: false,
    },
  },
})
