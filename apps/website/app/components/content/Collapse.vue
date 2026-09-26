<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '../AppIcon.vue'
import BaseCollapsible from '../base/BaseCollapsible.vue'

const props = withDefaults(defineProps<{ title?: string, open?: boolean | string }>(), { title: '展开说明', open: false })
// MDC accepts both :open="true" and the literal open="true" form.
const initialOpen = computed(() => props.open === true || props.open === '' || props.open === 'true')
</script>

<template>
  <BaseCollapsible :default-open="initialOpen" class="my-6 min-w-0 border border-line rounded-panel bg-surface">
    <template #trigger="{ open: expanded }">
      <button type="button" class="control-quiet min-h-12 min-w-0 w-full flex items-center gap-3 px-4 py-3 text-left text-heading font-medium md:px-5">
        <AppIcon name="down" class="size-4 transition-transform duration-[var(--duration-interaction)] motion-reduce:transition-none" :class="{ '-rotate-90': !expanded }" />
        <span class="min-w-0 flex-1 break-words">{{ title }}</span>
      </button>
    </template>
    <div class="collapse-body border-t border-line px-4 py-1 md:px-5">
      <slot />
    </div>
  </BaseCollapsible>
</template>

<style scoped>
.collapse-body :deep(> :first-child) { margin-top: 1rem; }
.collapse-body :deep(> :last-child) { margin-bottom: 1rem; }
</style>
