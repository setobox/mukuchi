import { circleMask, createThemeController } from '~/features/theme/controller'

export default defineNuxtPlugin({
  name: 'site-theme',
  enforce: 'post',
  setup(nuxtApp) {
    const mode = useColorMode()
    const reducedMotion = usePreferredReducedMotion()
    const system = usePreferredColorScheme()
    const controller = createThemeController({
      preference: () => mode.preference,
      resolved: () => mode.value,
      unknown: () => mode.unknown,
      system: () => system.value === 'no-preference' ? null : system.value,
      apply: async (preference) => {
        mode.preference = preference
        await nextTick()
      },
      canAnimate: () => import.meta.client && reducedMotion.value !== 'reduce' && typeof document.startViewTransition === 'function',
      start: (update) => {
        document.documentElement.classList.add('theme-transition')
        return document.startViewTransition(update)
      },
      animate: (value, origin) => {
        const mask = circleMask(origin ?? { x: innerWidth / 2, y: innerHeight / 2 }, innerWidth, innerHeight)
        return document.documentElement.animate(
          { clipPath: value === 'dark' ? mask.toReversed() : mask },
          { duration: 400, easing: 'ease-out', fill: 'forwards', pseudoElement: value === 'dark' ? '::view-transition-old(root)' : '::view-transition-new(root)' },
        )
      },
      finish: () => {
        if (import.meta.client)
          document.documentElement.classList.remove('theme-transition')
      },
    })
    watch([system, reducedMotion], () => controller.cancel())
    nuxtApp.hook('page:start', controller.cancel)
    nuxtApp.hook('app:error', controller.cancel)
    if (import.meta.hot)
      import.meta.hot.dispose(controller.cancel)
    return { provide: { siteTheme: controller } }
  },
})
