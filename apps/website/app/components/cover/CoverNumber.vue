<script setup lang="ts">
defineProps<{ label: string, min: number, max: number, step?: number, unit?: string }>()
const value = defineModel<number>({ required: true })
</script>

<template>
  <label class="cover-field">
    <span>{{ label }}<span v-if="unit" class="ml-1 text-muted">{{ unit }}</span></span>
    <input v-model.number="value" type="number" :min="min" :max="max" :step="step ?? 1" class="cover-input">
  </label>
</template>
