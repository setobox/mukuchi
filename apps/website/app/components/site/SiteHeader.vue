<script setup lang="ts">
import { rssPath } from '#shared/rss/config'

const { site } = useAppConfig()
const config = useRuntimeConfig()
const rssHref = computed(() => `${config.app.baseURL.replace(/\/$/, '')}${rssPath}`)
const palette = useCommandPalette()
const route = useRoute()
const page = usePageContext()
const { items: navigation } = useSiteNavigation()
const { y } = useWindowScroll()
const menuOpen = ref(false)
const movingDown = ref(false)
const desktop = useMediaQuery('(min-width: 1200px)')
const showTitle = computed(() => page.value.kind === 'detail' && y.value > 80 && movingDown.value)

watch(y, (current, previous) => {
  if (Math.abs(current - previous) >= 2)
    movingDown.value = current > previous
})
watch(
  () => route.fullPath,
  () => {
    menuOpen.value = false
    movingDown.value = false
  },
)
watch(desktop, (value) => {
  if (value)
    menuOpen.value = false
})
</script>

<template>
  <header
    class="ui-feedback fixed inset-x-0 top-0 z-header h-[var(--header-height)] border-b"
    :class="
      y > 8
        ? 'border-line bg-[color-mix(in_srgb,var(--color-canvas)_90%,transparent)] backdrop-blur-[18px]'
        : 'border-transparent bg-canvas'
    "
  >
    <div class="site-container h-full flex items-center gap-4 lg:gap-7">
      <NuxtLink
        to="/posts"
        class="ui-link min-h-11 inline-flex flex-none items-center gap-3 rounded-button text-[19px] text-heading tracking-[-0.8px] font-mono"
        :aria-label="`${site.owner.name}，返回文章列表`"
      >
        <span>{{ site.name }}</span>
      </NuxtLink>
      <div class="relative hidden h-[26px] min-w-0 flex-1 lg:block" aria-live="polite">
        <Transition name="header-title">
          <span
            v-if="showTitle"
            :title="page.title"
            class="absolute block max-w-full truncate text-muted"
          >{{ page.title }}</span>
        </Transition>
      </div>
      <SiteDesktopNavigation :items="navigation" :reset-key="`${route.fullPath}:${desktop}`" class="hidden lg:block" />
      <div class="ml-auto flex items-center gap-0.5 lg:ml-0 lg:border-l lg:border-line lg:pl-4">
        <ThemeToggle />
        <ClientOnly><AccountMenu /></ClientOnly>
        <button
          v-if="site.features.search"
          type="button"
          class="icon-button"
          aria-label="站内搜索"
          aria-haspopup="dialog"
          title="站内搜索（Ctrl / ⌘ P）"
          @click="palette.open('search')"
        >
          <AppIcon name="search" />
        </button>
        <a :href="rssHref" class="icon-button" aria-label="RSS 订阅" title="RSS 订阅">
          <AppIcon name="rss" />
        </a>
        <button
          v-if="site.features.commands"
          type="button"
          class="icon-button"
          :class="{ 'hidden md:inline-flex': site.features.search }"
          aria-label="命令面板"
          aria-haspopup="dialog"
          title="命令面板"
          @click="palette.open('commands')"
        >
          <AppIcon name="command" />
        </button>
        <div class="size-11 lg:hidden">
          <AcrylicDialog v-model="menuOpen" title="导航" placement="drawer">
            <template #trigger="{ open, expanded, toggle }">
              <button
                type="button"
                class="icon-button"
                :aria-label="open ? '关闭导航' : '打开导航'"
                :aria-expanded="open"
                aria-haspopup="dialog"
                @click="toggle"
              >
                <MenuToggleIcon :expanded="expanded" />
              </button>
            </template>
            <SiteMobileNavigation :items="navigation" :open="menuOpen" @navigate="menuOpen = false" />
          </AcrylicDialog>
        </div>
      </div>
    </div>
  </header>
</template>

<style scoped>
.header-title-enter-active,
.header-title-leave-active {
  transition:
    opacity 180ms,
    transform 180ms;
}
.header-title-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.header-title-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
