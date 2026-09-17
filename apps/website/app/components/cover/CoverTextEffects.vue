<script setup lang="ts">
import type { TextSettings } from '~/features/cover/model'
import BaseSelect from '../base/BaseSelect.vue'
import BaseSwitch from '../base/BaseSwitch.vue'
import CoverNumber from './CoverNumber.vue'

const value = defineModel<TextSettings>({ required: true })
function addStop() {
  if (value.value.fill.stops.length >= 5)
    return
  const sorted = [...value.value.fill.stops].sort((a, b) => a.position - b.position)
  let index = 0
  for (let i = 1; i < sorted.length - 1; i++) {
    if (sorted[i + 1]!.position - sorted[i]!.position > sorted[index + 1]!.position - sorted[index]!.position)
      index = i
  }
  value.value.fill.stops.push({ color: '#a369ff', position: Math.round((sorted[index]!.position + sorted[index + 1]!.position) / 2) })
}
</script>

<template>
  <div class="space-y-2">
    <div class="grid grid-cols-2 gap-2">
      <BaseSelect v-model="value.fill.mode" label="文字填充" :class="{ 'col-span-2': value.fill.mode !== 'solid' }" :options="[{ value: 'solid', label: '纯色' }, { value: 'linear', label: '线性渐变' }, { value: 'radial', label: '径向渐变' }]" />
      <label v-if="value.fill.mode === 'solid'" class="cover-field">文字颜色<input v-model="value.fill.color" type="color" class="cover-input w-full p-1"></label>
    </div>
    <template v-if="value.fill.mode !== 'solid'">
      <div v-for="(stop, index) in value.fill.stops" :key="index" class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_44px] items-end gap-2">
        <label class="cover-field">色标 {{ index + 1 }}<input v-model="stop.color" type="color" class="cover-input w-full p-1"></label>
        <CoverNumber v-model="stop.position" :label="`色标 ${index + 1} 位置`" :min="0" :max="100" unit="%" />
        <button type="button" :aria-label="`删除色标 ${index + 1}`" :disabled="value.fill.stops.length <= 2" class="min-h-11 rounded-button text-muted disabled:cursor-not-allowed hover:text-error disabled:opacity-35" @click="value.fill.stops.splice(index, 1)">
          <span class="i-lucide-trash-2 mx-auto block size-4" aria-hidden="true" />
        </button>
      </div>
      <button type="button" :disabled="value.fill.stops.length >= 5" class="min-h-11 w-full border border-line-strong rounded-button text-xs text-ink disabled:opacity-45" @click="addStop">
        添加色标
      </button>
      <CoverNumber v-if="value.fill.mode === 'linear'" v-model="value.fill.angle" label="渐变角度" :min="0" :max="360" unit="°" />
    </template>
    <BaseSwitch v-model="value.stroke.enabled" label="文字描边" />
    <div v-if="value.stroke.enabled" class="grid grid-cols-2 gap-3">
      <label class="cover-field">描边颜色<input v-model="value.stroke.color" type="color" class="cover-input w-full p-1"></label>
      <CoverNumber v-model="value.stroke.width" label="描边宽度" :min="1" :max="16" unit="px" />
    </div>
    <BaseSwitch v-model="value.glow.enabled" label="文字发光" />
    <div v-if="value.glow.enabled" class="grid grid-cols-2 gap-3">
      <label class="col-span-2 cover-field">发光颜色<input v-model="value.glow.color" type="color" class="cover-input w-full p-1"></label>
      <CoverNumber v-model="value.glow.opacity" label="发光不透明度" :min="0" :max="1" :step="0.05" />
      <CoverNumber v-model="value.glow.blur" label="发光模糊" :min="0" :max="80" unit="px" />
    </div>
  </div>
</template>
