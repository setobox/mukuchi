<script setup lang="ts">
defineProps<{ sticky?: boolean }>()
</script>

<template>
  <div class="grid items-start gap-layout lg:grid-cols-[var(--sidebar-width)_minmax(0,1fr)]">
    <div class="min-w-0 lg:col-start-2 lg:row-start-1">
      <slot />
    </div>
    <aside
      class="min-w-0 lg:col-start-1 lg:row-start-1"
      aria-label="侧边栏"
      :class="{
        'lg:sticky lg:top-[calc(var(--header-height)+24px)]':
          sticky,
      }"
    >
      <div :class="{ 'lg:max-h-[calc(100dvh-var(--header-height)-48px)] lg:overflow-y-auto lg:p-6 lg:-m-6': sticky }">
        <slot name="sidebar">
          <SiteSidebar />
        </slot>
      </div>
    </aside>
  </div>
</template>
