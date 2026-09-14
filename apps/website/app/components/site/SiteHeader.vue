<script setup lang="ts">
const { site } = useAppConfig()
const route = useRoute()
const page = usePageContext()
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
    class="[transition-property:background,border-color] fixed inset-x-0 top-0 z-header h-[var(--header-height)] border-b duration-180 ease-[ease]"
    :class="
      y > 8
        ? 'border-line bg-[color-mix(in_srgb,var(--color-canvas)_90%,transparent)] backdrop-blur-[18px]'
        : 'border-transparent bg-canvas'
    "
  >
    <div class="site-container h-full flex items-center gap-4 lg:gap-7">
      <NuxtLink
        to="/posts"
        class="inline-flex flex-none items-center gap-3 rounded text-[19px] text-heading tracking-[-0.8px] font-mono"
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
      <nav class="hidden items-center gap-1.5 text-s lg:flex" aria-label="主导航">
        <NuxtLink
          v-for="item in site.navigation"
          :key="item.to"
          :to="item.to"
          :aria-current="page.section === item.section ? 'page' : undefined"
          :class="
            page.section === item.section ? 'bg-surface text-heading font-semibold' : 'text-muted'
          "
          class="relative min-h-11 rounded-lg px-[15px] py-2.5 transition-colors duration-180 ease-[ease] hover:text-heading"
        >
          {{ item.label }}
        </NuxtLink>
      </nav>
      <div class="ml-auto flex items-center gap-0.5 lg:ml-0 lg:border-l lg:border-line lg:pl-4">
        <ThemeToggle />
        <button
          type="button"
          class="icon-button"
          :disabled="!site.features.search"
          aria-label="站内搜索（尚未开放）"
          title="站内搜索（尚未开放）"
        >
          <AppIcon name="search" />
        </button>
        <button
          type="button"
          class="hidden icon-button md:inline-flex"
          :disabled="!site.features.commands"
          aria-label="命令面板（尚未开放）"
          title="命令面板（尚未开放）"
        >
          <AppIcon name="command" />
        </button>
        <button
          type="button"
          class="icon-button lg:hidden"
          aria-label="打开导航"
          :aria-expanded="menuOpen"
          aria-haspopup="dialog"
          @click="menuOpen = true"
        >
          <AppIcon name="menu" />
        </button>
      </div>
    </div>
    <AcrylicDialog v-model="menuOpen" title="网站导航">
      <nav aria-label="移动导航" class="flex flex-col gap-1 text-s">
        <NuxtLink
          v-for="item in site.navigation"
          :key="item.to"
          :to="item.to"
          :aria-current="page.section === item.section ? 'page' : undefined"
          class="min-h-14 flex items-center justify-between rounded-button px-4 py-3"
          :class="
            page.section === item.section
              ? 'bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)] text-accent-soft'
              : 'hover:bg-line'
          "
          @click="menuOpen = false"
        >
          <span>{{ item.label }}</span><AppIcon name="arrow" />
        </NuxtLink>
      </nav>
      <template #footer>
        <span class="text-base text-muted">{{ site.name }}</span><BaseButton variant="ghost" @click="menuOpen = false">
          收起<AppIcon name="up" />
        </BaseButton>
      </template>
    </AcrylicDialog>
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
