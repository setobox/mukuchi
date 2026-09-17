<script setup lang="ts">
import type { TextSettings } from '~/features/cover/model'
import { computed } from 'vue'
import BaseSlider from '../base/BaseSlider.vue'
import CoverTextEffects from './CoverTextEffects.vue'

const value = defineModel<TextSettings>({ required: true })
const weights = [{ value: 400, label: '常规' }, { value: 500, label: '中等' }, { value: 600, label: '半粗' }, { value: 700, label: '粗体' }]
const weight = computed({
  get: () => Number(value.value.weight),
  set: (next: number) => { value.value.weight = String(next) as TextSettings['weight'] },
})
</script>

<template>
  <div class="grid grid-cols-2 gap-2">
    <BaseSlider v-model="weight" label="字重" :min="400" :max="700" :step="100" :marks="weights" class="col-span-2" />
    <BaseSlider v-model="value.size" label="字号" :min="12" :max="256" unit="px" editable class="col-span-2" />
    <BaseSlider v-model="value.lineHeight" label="行距" :min="1" :max="2" :step="0.1" unit="倍" editable class="col-span-2" />
    <BaseSlider v-model="value.offsetX" label="横向偏移" :min="0" :max="240" unit="px" editable class="col-span-2" />
    <BaseSlider v-model="value.offsetY" label="纵向偏移" :min="-2048" :max="2048" :origin="0" unit="px" editable class="col-span-2" />
    <CoverTextEffects v-model="value" class="col-span-2" />
  </div>
</template>
