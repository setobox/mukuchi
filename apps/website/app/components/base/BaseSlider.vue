<script setup lang="ts">
import { SliderRoot, SliderThumb, SliderTrack } from 'reka-ui'
import { computed, ref, useId, useTemplateRef } from 'vue'
import { useSliderMotion } from '~/shared/slider-motion'

const props = withDefaults(defineProps<{
  label: string
  min: number
  max: number
  step?: number
  unit?: string
  marks?: readonly { value: number, label: string }[]
  editable?: boolean
  disabled?: boolean
  origin?: number
}>(), { step: 1 })
const value = defineModel<number>({ required: true })
const id = useId()
const control = useTemplateRef<HTMLElement>('control')
const dragging = ref(false)
const track = useTemplateRef<HTMLElement>('track')
const motion = useSliderMotion(track)
const percent = (next: number) => (next - props.min) / (props.max - props.min) * 100
const originPercent = computed(() => percent(props.origin ?? props.min))
const fillStyle = computed(() => ({ left: `${Math.min(originPercent.value, percent(value.value))}%`, width: `${Math.abs(percent(value.value) - originPercent.value)}%` }))
let bounds: { left: number, width: number } | undefined
function down(event: PointerEvent) {
  const root = event.currentTarget as HTMLElement
  if (props.disabled || root.closest('fieldset:disabled') || event.button !== 0)
    return
  dragging.value = true
  bounds = root.getBoundingClientRect()
}
function move(event: PointerEvent) {
  if (dragging.value && bounds)
    motion.stretch(event.clientX, bounds.left, bounds.width)
}
function release() {
  if (!dragging.value)
    return
  dragging.value = false
  bounds = undefined
  void motion.release()
}
const currentLabel = computed(() => props.marks?.find(mark => mark.value === value.value)?.label)
function update(next: number) {
  if (!Number.isFinite(next) || props.disabled || control.value?.closest('fieldset:disabled'))
    return value.value
  const clamped = Math.max(props.min, Math.min(props.max, next))
  const normalized = Number(Math.min(props.max, props.min + Math.round((clamped - props.min) / props.step) * props.step).toFixed(6))
  value.value = normalized
  return normalized
}
function commit(event: Event) {
  const input = event.target as HTMLInputElement
  input.value = String(update(input.valueAsNumber))
}
function input(event: Event) {
  const next = (event.target as HTMLInputElement).valueAsNumber
  if (Number.isFinite(next) && next >= props.min && next <= props.max)
    update(next)
}
</script>

<template>
  <div ref="control" class="slider-control min-w-0" :data-dragging="dragging || undefined">
    <div class="min-h-5 flex items-center justify-between gap-3 text-xs">
      <label :id="`${id}-label`" :for="editable ? `${id}-input` : id" class="text-muted">{{ label }}</label>
      <output v-if="!editable" :for="id" class="text-ink tabular-nums">{{ value }}{{ unit }}<span v-if="currentLabel" class="ml-2">{{ currentLabel }}</span></output>
    </div>
    <div class="flex items-start gap-3">
      <div class="min-w-0 flex-1">
        <SliderRoot :model-value="[value]" :min="min" :max="max" :step="step" :disabled="disabled" class="control-disabled relative mx-2 min-h-11 flex touch-none select-none items-center" @pointerdown.capture="down" @pointermove="move" @pointerup="release" @pointercancel="release" @lostpointercapture="release" @update:model-value="next => update(next?.[0] ?? value)">
          <SliderTrack class="relative h-1.5 grow">
            <div ref="track" class="slider-track absolute inset-0 rounded-full bg-line-strong">
              <span data-slider-fill class="absolute h-full rounded-full bg-accent" :style="fillStyle" />
            </div>
            <span v-if="origin !== undefined" aria-hidden="true" class="pointer-events-none absolute top-1/2 h-3 w-0.5 bg-heading -translate-x-1/2 -translate-y-1/2" :style="{ left: `${originPercent}%` }" />
            <span v-for="mark in marks" :key="mark.value" aria-hidden="true" class="pointer-events-none absolute top-1/2 h-3 w-0.5 rounded bg-muted -translate-x-1/2 -translate-y-1/2" :style="{ left: `${percent(mark.value)}%` }" />
          </SliderTrack>
          <SliderThumb :id="id" :aria-labelledby="`${id}-label`" :aria-valuetext="`${value}${unit ?? ''}${currentLabel ? ` ${currentLabel}` : ''}`" class="slider-thumb block size-5 border-2 border-accent rounded-full bg-canvas shadow-sm" />
        </SliderRoot>
        <div v-if="marks" aria-hidden="true" class="flex justify-between text-xs text-muted">
          <span v-for="mark in marks" :key="mark.value">{{ mark.value }}</span>
        </div>
        <div v-else-if="origin !== undefined" aria-hidden="true" class="flex justify-between text-xs text-muted">
          <span>{{ min }}</span><span>{{ origin }}</span><span>{{ max }}</span>
        </div>
      </div>
      <div v-if="editable" class="flex shrink-0 items-center gap-1 text-xs text-ink">
        <input :id="`${id}-input`" type="number" :value="value" :min="min" :max="max" :step="step" :disabled="disabled" :aria-label="`${label}数值`" class="field-control w-20 px-2 text-right tabular-nums" @input="input" @change="commit" @blur="commit">
        <span v-if="unit" class="w-4 text-muted">{{ unit }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.slider-track, .slider-thumb { transition: height 180ms ease, margin 180ms ease, scale 180ms ease, box-shadow 180ms ease; }
.slider-control:has([role='slider']:focus-visible) .slider-track,
.slider-control[data-dragging] .slider-track { height: 10px; margin-top: -2px; }
.slider-control:has([role='slider']:focus-visible) .slider-thumb,
.slider-control[data-dragging] .slider-thumb { scale: 1.2; box-shadow: 0 0 0 5px var(--color-accent-surface); }
.slider-control[data-dragging] :is(input, output) { color: var(--color-accent-text); }
@media (hover: hover) {
  .slider-control:has([role='slider']:not([data-disabled]):hover) .slider-track { height: 10px; margin-top: -2px; }
}
@media (prefers-reduced-motion: reduce) {
  .slider-track, .slider-thumb { transition: none; }
  .slider-control[data-dragging] .slider-thumb { scale: 1; }
}
</style>
