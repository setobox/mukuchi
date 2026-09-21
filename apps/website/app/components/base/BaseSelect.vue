<script setup lang="ts" generic="T extends string | number">
import { SelectContent, SelectIcon, SelectItem, SelectItemIndicator, SelectItemText, SelectPortal, SelectRoot, SelectTrigger, SelectValue, SelectViewport } from 'reka-ui'
import { computed, inject, ref, useId } from 'vue'
import { overlayTargetKey } from '~/shared/overlay'

const props = defineProps<{
  options: readonly { value: T, label: string, disabled?: boolean }[]
  label?: string
  ariaLabel?: string
  placeholder?: string
  disabled?: boolean
}>()
const emit = defineEmits<{ closeAutoFocus: [event: Event] }>()
const value = defineModel<T>()
const id = useId()
const open = ref(false)
const target = inject(overlayTargetKey, undefined)
const portalTarget = computed(() => target?.value ?? undefined)
// Encode every value, including the valid empty-string option, without losing its type.
const key = (item: string | number) => `${typeof item}:${item}`
const selected = computed(() => value.value === undefined ? undefined : key(value.value))
const selectedLabel = computed(() => props.options.find(option => option.value === value.value)?.label ?? props.placeholder ?? '请选择')
function update(next: unknown) {
  const option = props.options.find(option => key(option.value) === next)
  if (option && !option.disabled && !props.disabled)
    value.value = option.value
}
function escape(event: KeyboardEvent) {
  event.preventDefault()
  event.stopPropagation()
  open.value = false
}
</script>

<template>
  <div class="min-w-0 flex flex-col gap-2">
    <label v-if="label" :for="id" class="text-xs text-muted">{{ label }}</label>
    <SelectRoot v-model:open="open" :model-value="selected" :disabled="disabled" @update:model-value="update">
      <SelectTrigger :id="id" :aria-label="ariaLabel" class="field-control relative w-full flex items-center py-2 pl-3 pr-10 text-left text-sm data-[state=open]:border-accent">
        <SelectValue :placeholder="placeholder ?? '请选择'" class="min-w-0 truncate">
          {{ selectedLabel }}
        </SelectValue>
        <SelectIcon class="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2" aria-hidden="true">
          <span class="i-lucide-chevron-down block size-4 text-muted" />
        </SelectIcon>
      </SelectTrigger>
      <SelectPortal :to="portalTarget ?? 'body'">
        <SelectContent position="popper" align="start" :side-offset="6" :collision-padding="8" :collision-boundary="portalTarget" :body-lock="!portalTarget" class="select-content z-50 max-w-[min(400px,calc(100vw-16px))] min-w-[var(--reka-select-trigger-width)] overflow-hidden border border-line-strong rounded-button bg-surface text-sm text-ink shadow-floating" @escape-key-down="escape" @close-auto-focus="emit('closeAutoFocus', $event)">
          <SelectViewport class="max-h-[min(320px,var(--reka-select-content-available-height))] overflow-y-auto overscroll-contain p-1">
            <SelectItem v-for="option in options" :key="key(option.value)" :value="key(option.value)" :disabled="option.disabled" :text-value="option.label" class="control-quiet relative min-h-11 flex cursor-default select-none items-center py-2 pl-3 pr-10 data-[state=checked]:bg-accent-surface data-[highlighted]:text-accent-soft data-[state=checked]:text-accent-soft data-[highlighted]:bg-accent-pressed!">
              <SelectItemText class="min-w-0 break-words">
                {{ option.label }}
              </SelectItemText>
              <SelectItemIndicator class="absolute right-3 top-1/2 size-4 -translate-y-1/2">
                <span aria-hidden="true" class="i-lucide-check block size-4" />
              </SelectItemIndicator>
            </SelectItem>
          </SelectViewport>
        </SelectContent>
      </SelectPortal>
    </SelectRoot>
  </div>
</template>

<style scoped>
@media (prefers-reduced-motion: no-preference) {
  .select-content[data-state='open'] {
    animation: select-enter var(--duration-interaction) var(--ease-interaction);
  }
  @keyframes select-enter {
    from { opacity: 0; }
    to { opacity: 1; }
  }
}
</style>
