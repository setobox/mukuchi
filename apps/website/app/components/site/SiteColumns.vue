<script setup lang="ts">
import { useElementSize } from '@vueuse/core'
import { useTemplateRef } from 'vue'

defineProps<{ sticky?: boolean }>()

const sidebar = useTemplateRef<HTMLElement>('sidebar')
const { height: sidebarHeight } = useElementSize(sidebar, { width: 0, height: 0 }, { box: 'border-box' })
</script>

<template>
  <div class="grid items-start gap-layout lg:grid-cols-[var(--sidebar-width)_minmax(0,1fr)]">
    <div class="min-w-0 lg:col-start-2 lg:row-start-1">
      <slot />
    </div>
    <aside
      ref="sidebar"
      class="min-w-0 lg:col-start-1 lg:row-start-1"
      aria-label="侧边栏"
      :style="{ '--sidebar-height': `${sidebarHeight}px` }"
      :class="{
        'lg:sticky lg:top-[min(calc(var(--header-height)+24px),calc(100dvh-var(--sidebar-height)-24px))]':
          sticky,
      }"
    >
      <slot name="sidebar">
        <SiteSidebar />
      </slot>
    </aside>
  </div>
</template>
