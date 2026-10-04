<script setup lang="ts">
import { TooltipContent, TooltipPortal, TooltipProvider, TooltipRoot, TooltipTrigger } from 'reka-ui'
import { computed, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  text: string
  toggleOnClick?: boolean
  disabled?: boolean
  delayDuration?: number
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
}>(), { delayDuration: 250, side: 'top', align: 'center' })
const opened = ref(false)
const open = computed({
  get: () => !props.disabled && opened.value,
  set: (value: boolean) => { opened.value = !props.disabled && value },
})
watch(() => props.disabled, () => {
  opened.value = false
})
function click() {
  if (props.toggleOnClick)
    open.value = !open.value
}
</script>

<template>
  <TooltipProvider :delay-duration="delayDuration">
    <TooltipRoot v-model:open="open" :disabled="disabled" :disable-closing-trigger="toggleOnClick">
      <TooltipTrigger as-child @click="click">
        <slot />
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent :side="side" :align="align" :side-offset="8" :collision-padding="16" class="z-50 max-h-[var(--reka-tooltip-content-available-height)] max-w-[min(18rem,var(--reka-tooltip-content-available-width))] overflow-y-auto whitespace-pre-line border border-line-strong rounded-button bg-surface px-3 py-2 text-xs text-heading leading-6 shadow-dialog">
          {{ text }}
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
</template>
