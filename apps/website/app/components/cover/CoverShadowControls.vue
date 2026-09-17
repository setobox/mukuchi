<script setup lang="ts">
import type { ShadowSettings } from '~/features/cover/model'
import BaseSwitch from '../base/BaseSwitch.vue'

defineProps<{ label: string }>()
const value = defineModel<ShadowSettings>({ required: true })
</script>

<template>
  <div>
    <BaseSwitch v-model="value.enabled" :label="label" />
    <div v-if="value.enabled" class="grid grid-cols-2 mt-3 gap-3">
      <label class="cover-field">阴影颜色<input v-model="value.color" type="color" class="cover-input w-full p-1"></label>
      <CoverNumber v-model="value.opacity" label="不透明度" :min="0" :max="1" :step="0.05" />
      <CoverNumber v-model="value.blur" label="模糊" :min="0" :max="80" unit="px" />
      <CoverNumber v-model="value.x" label="阴影横向偏移" :min="-100" :max="100" unit="px" />
      <CoverNumber v-model="value.y" label="阴影纵向偏移" :min="-100" :max="100" unit="px" />
    </div>
  </div>
</template>
