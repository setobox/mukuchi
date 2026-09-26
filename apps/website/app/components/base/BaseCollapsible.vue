<script setup lang="ts">
import { CollapsibleContent, CollapsibleRoot, CollapsibleTrigger } from 'reka-ui'
import { computed, nextTick, ref, useId, useTemplateRef, watch } from 'vue'
import { collapseRevealEvent, isCollapseRevealEvent } from '~/features/collapse/reveal'

const props = withDefaults(defineProps<{ open?: boolean, defaultOpen?: boolean, disabled?: boolean }>(), { open: undefined, defaultOpen: false })
const emit = defineEmits<{ 'update:open': [open: boolean] }>()
const internalOpen = ref(props.defaultOpen)
const expanded = computed({
  get: () => props.open ?? internalOpen.value,
  set: (value: boolean) => {
    internalOpen.value = value
    emit('update:open', value)
  },
})
const contentId = useId()
const viewport = useTemplateRef<HTMLElement>('viewport')
const controls = useTemplateRef<HTMLElement>('controls')
const instant = ref(false)

// Run before the DOM patch, after all parent props (including disabled) update.
watch(expanded, (open) => {
  if (!open && viewport.value?.contains(document.activeElement)) {
    const trigger = controls.value?.querySelector<HTMLButtonElement>('button[aria-expanded]')
    if (trigger && !trigger.disabled && !props.disabled)
      trigger.focus({ preventScroll: true })
    else
      controls.value?.focus({ preventScroll: true })
  }
}, { flush: 'pre' })

async function reveal() {
  if (expanded.value || props.disabled)
    return
  // Anchor navigation measures the final layout, including nested regions.
  instant.value = true
  expanded.value = true
  await nextTick()
  viewport.value?.getBoundingClientRect()
  instant.value = false
}
function requestReveal(event: Event) {
  if (isCollapseRevealEvent(event))
    event.detail.waitUntil(reveal())
}
</script>

<template>
  <CollapsibleRoot v-model:open="expanded" :disabled="disabled" :unmount-on-hide="false">
    <div ref="controls" class="flex items-center" tabindex="-1">
      <slot name="leading" :open="expanded" />
      <CollapsibleTrigger as-child :aria-controls="contentId">
        <slot name="trigger" :open="expanded" />
      </CollapsibleTrigger>
    </div>
    <div
      :id="contentId" ref="viewport" class="collapsible-viewport" data-collapsible-content
      :data-open="expanded" :data-instant="instant || undefined" :inert="!expanded" :aria-hidden="!expanded"
      @[collapseRevealEvent]="requestReveal"
    >
      <CollapsibleContent force-mount class="min-h-0 overflow-hidden">
        <div class="flow-root">
          <slot :open="expanded" />
        </div>
      </CollapsibleContent>
    </div>
  </CollapsibleRoot>
</template>

<style scoped>
.collapsible-viewport {
  display: grid;
  grid-template-rows: 0fr;
  visibility: hidden;
  transition: grid-template-rows var(--duration-interaction) var(--ease-interaction), visibility 0s var(--duration-interaction);
}
.collapsible-viewport[data-open='true'] {
  grid-template-rows: 1fr;
  visibility: visible;
  transition-delay: 0s;
}
.collapsible-viewport[data-instant] { transition: none; }
@media (prefers-reduced-motion: reduce) {
  .collapsible-viewport { transition: none; }
}
</style>
