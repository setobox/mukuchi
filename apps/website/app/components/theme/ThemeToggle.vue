<script setup lang="ts">
import type { IconName } from '~/shared/icons'
import { nextPreference } from '~~/shared/theme/preference'

const { preference, unknown, isTransitioning, cyclePreference } = useSiteTheme()
const names = { system: '跟随系统', light: '浅色', dark: '深色' } as const
const modeIcons = { system: 'monitor', light: 'sun', dark: 'moon' } satisfies Record<string, IconName>
const label = computed(() => `当前主题：${names[preference.value]}；切换为${names[nextPreference(preference.value)]}`)
</script>

<template>
  <ClientOnly>
    <button
      type="button"
      class="icon-button aria-disabled:cursor-wait"
      :aria-label="label"
      :title="label"
      :aria-disabled="isTransitioning || unknown"
      :aria-busy="isTransitioning"
      @click="cyclePreference"
    >
      <AppIcon :name="modeIcons[preference]" />
    </button>
    <template #fallback>
      <span class="h-11 w-11 inline-flex shrink-0" aria-hidden="true" />
    </template>
  </ClientOnly>
</template>

<style scoped>
:global(html.theme-transition::view-transition-old(root)),
:global(html.theme-transition::view-transition-new(root)) {
  animation: none;
  mix-blend-mode: normal;
}
:global(html.theme-transition::view-transition-old(root)),
:global(html.dark.theme-transition::view-transition-new(root)) {
  z-index: 1;
}
:global(html.theme-transition::view-transition-new(root)),
:global(html.dark.theme-transition::view-transition-old(root)) {
  z-index: 9999;
}
</style>
