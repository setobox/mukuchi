<script setup lang="ts">
import { SwitchRoot, SwitchThumb } from 'reka-ui'
import { useId, useTemplateRef } from 'vue'

const props = defineProps<{ label: string, disabled?: boolean }>()
const value = defineModel<boolean>({ required: true })
const id = useId()
const root = useTemplateRef<HTMLElement>('root')
function update(next: boolean) {
  if (!props.disabled && !root.value?.closest('fieldset:disabled'))
    value.value = next
}
</script>

<template>
  <div ref="root" class="min-h-11 flex items-center justify-between gap-3 text-sm">
    <label :id="`${id}-label`" :for="id" class="min-h-11 flex flex-1 cursor-pointer items-center text-ink">{{ label }}</label>
    <SwitchRoot :id="id" :model-value="value" :aria-labelledby="`${id}-label`" :disabled="disabled" class="group min-h-11 min-w-11 flex shrink-0 items-center justify-center rounded-button outline-none disabled:cursor-not-allowed disabled:opacity-45 focus-visible:ring-2 focus-visible:ring-accent-soft" @update:model-value="update">
      <span class="h-6 w-11 border border-line-strong rounded-full bg-line-strong p-0.5 transition-colors group-data-[state=checked]:border-accent group-data-[state=checked]:bg-accent">
        <SwitchThumb class="block size-[18px] rounded-full bg-heading shadow-sm transition-transform duration-200 data-[state=checked]:translate-x-5 data-[state=checked]:bg-on-accent" />
      </span>
    </SwitchRoot>
  </div>
</template>
