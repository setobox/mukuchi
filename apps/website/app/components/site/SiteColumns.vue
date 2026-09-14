<script setup lang="ts">
defineProps<{ sticky?: boolean }>();
</script>
<template>
  <div class="grid items-start gap-layout lg:grid-cols-[var(--sidebar-width)_minmax(0,1fr)]">
    <aside
      aria-label="侧边栏"
      :class="{
        'lg:sticky lg:top-[calc(var(--header-height)+24px)] lg:max-h-[calc(100dvh-var(--header-height)-48px)] lg:overflow-y-auto':
          sticky,
      }"
    >
      <slot name="sidebar"><SiteSidebar /></slot>
    </aside>
    <div class="min-w-0"><slot /></div>
  </div>
</template>
