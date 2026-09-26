<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import { seriesSchema } from '#shared/content/schema'

const props = defineProps<{ metadata: Record<string, unknown> }>()
const emit = defineEmits<{ change: [patch: { series?: string, seriesOrder?: number }] }>()
const id = useId()
const name = ref('')
watch(() => props.metadata.series, value => name.value = typeof value === 'string' ? value : '', { immediate: true })
const errors = computed(() => {
  const result = seriesSchema.safeParse(props.metadata)
  return result.success ? [] : result.error.issues
})
function setName(event: Event) {
  const series = (event.target as HTMLInputElement).value.trim()
  emit('change', series ? { series } : { series: undefined, seriesOrder: undefined })
}
function setOrder(event: Event) {
  const input = event.target as HTMLInputElement
  emit('change', { seriesOrder: input.value === '' ? undefined : input.valueAsNumber })
}
</script>

<template>
  <fieldset class="m-0 min-w-0 border-0 p-0">
    <legend class="mb-3 text-sm text-heading">
      系列阅读
    </legend>
    <div class="grid gap-4 md:grid-cols-2">
      <label class="block text-xs text-muted">
        所属系列
        <input v-model="name" type="text" class="field-control mt-2 w-full px-3" :aria-describedby="`${id}-help${errors.length ? ` ${id}-error` : ''}`" :aria-invalid="errors.some(issue => issue.path[0] === 'series') || undefined" @change="setName">
      </label>
      <label class="block text-xs text-muted">
        系列顺序
        <input :value="metadata.seriesOrder ?? ''" type="number" min="0" step="1" :disabled="!name.trim()" class="field-control mt-2 w-full px-3" :aria-describedby="`${id}-help${errors.length ? ` ${id}-error` : ''}`" :aria-invalid="errors.some(issue => issue.path[0] === 'seriesOrder') || undefined" @change="setOrder">
      </label>
    </div>
    <p :id="`${id}-help`" class="mb-0 mt-3 text-xs text-muted">
      系列可不填；顺序为从 0 开始的整数，越小越靠前，留空排在已编号文章之后。清空系列会同时移除顺序。
    </p>
    <p v-if="errors.length" :id="`${id}-error`" class="mb-0 mt-2 text-xs text-error" role="alert">
      {{ errors.map(issue => issue.message).join('；') }}
    </p>
  </fieldset>
</template>
