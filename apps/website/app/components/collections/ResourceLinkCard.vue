<script setup lang="ts">
import type { ResourceLink } from '#shared/collections/types'
import { ref, watch } from 'vue'

const props = defineProps<{ item: ResourceLink }>()
const imageFailed = ref(false)
watch(() => props.item.imageUrl, () => {
  imageFailed.value = false
})
</script>

<template>
  <a
    data-resource-link
    :href="item.href"
    target="_blank"
    rel="noopener noreferrer"
    class="resource-link group ui-feedback relative flex gap-4 rounded-button py-5 no-underline focus-visible:underline"
  >
    <span data-resource-icon class="size-11 flex shrink-0 items-center justify-center overflow-hidden rounded-button bg-surface text-accent-soft">
      <img
        v-if="item.imageUrl && !imageFailed"
        :src="item.imageUrl"
        alt=""
        width="32"
        height="32"
        class="size-8 object-contain"
        loading="lazy"
        decoding="async"
        referrerpolicy="no-referrer"
        @error="imageFailed = true"
      >
      <span v-else class="i-lucide-link-2 text-xl" aria-hidden="true" />
    </span>
    <span data-resource-body class="min-w-0 flex-1 pr-2">
      <span class="flex items-start gap-2 text-heading font-medium group-focus-visible:text-accent-soft group-hover:text-accent-soft">
        <span class="min-w-0 break-words">{{ item.title }}</span>
        <span data-resource-arrow class="mt-1 inline-flex shrink-0 text-sm text-muted group-focus-visible:text-accent-soft group-hover:text-accent-soft"><AppIcon name="arrow" /></span>
      </span>
      <span v-if="item.description" class="mt-1 block break-words text-sm text-muted leading-relaxed">{{ item.description }}</span>
    </span>
  </a>
</template>

<style scoped>
.resource-link::before {
  content: '';
  position: absolute;
  inset: 8px -10px;
  border-radius: var(--radius-panel);
  background: var(--color-accent-surface);
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--duration-interaction) var(--ease-interaction);
}
.resource-link > span { position: relative; }
.resource-link:focus-visible::before { opacity: 1; }
@media (hover: hover) {
  .resource-link:hover::before { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .resource-link::before { transition: none; }
}
</style>
