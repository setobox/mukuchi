<script setup lang="ts">
import { CollapsibleContent, CollapsibleRoot, CollapsibleTrigger } from 'reka-ui'
import { useId } from 'vue'

withDefaults(defineProps<{ open?: boolean, defaultOpen?: boolean, disabled?: boolean }>(), { open: undefined })
const emit = defineEmits<{ 'update:open': [open: boolean] }>()
// Keep the controlled region stable even before the lazy content mounts.
const contentId = useId()
</script>

<template>
  <CollapsibleRoot v-slot="{ open: expanded }" :open="open" :default-open="defaultOpen" :disabled="disabled" @update:open="emit('update:open', $event)">
    <div class="flex items-center">
      <slot name="leading" :open="expanded" />
      <CollapsibleTrigger as-child :aria-controls="contentId">
        <slot name="trigger" :open="expanded" />
      </CollapsibleTrigger>
    </div>
    <div :id="contentId" :inert="!expanded">
      <CollapsibleContent class="collapsible-content overflow-hidden">
        <slot />
      </CollapsibleContent>
    </div>
  </CollapsibleRoot>
</template>

<style scoped>
@media (prefers-reduced-motion: no-preference) {
  .collapsible-content[data-state='open'] {
    animation: collapse-open var(--duration-interaction) var(--ease-interaction);
  }
  .collapsible-content[data-state='closed'] {
    animation: collapse-close var(--duration-interaction) var(--ease-interaction);
  }
  @keyframes collapse-open {
    from { height: 0; opacity: 0; }
    to { height: var(--reka-collapsible-content-height); opacity: 1; }
  }
  @keyframes collapse-close {
    from { height: var(--reka-collapsible-content-height); opacity: 1; }
    to { height: 0; opacity: 0; }
  }
}
</style>
