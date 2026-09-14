<script setup lang="ts">
import { useTimeoutFn } from '@vueuse/core'
import { onScopeDispose, watch } from 'vue'
import { createCodeCopy } from '~/features/code/blocks'
import AppIcon from '../AppIcon.vue'

const props = defineProps<{ code: string }>()
const { state, copy, reset } = createCodeCopy(async (text) => {
  if (!navigator.clipboard?.writeText)
    throw new Error('剪贴板不可用')
  await navigator.clipboard.writeText(text)
})
const timer = useTimeoutFn(reset, 2000, { immediate: false })
async function copyCode() {
  await copy(props.code)
  if (state.value === 'success')
    timer.start()
}
watch(() => props.code, () => {
  timer.stop()
  reset()
})
onScopeDispose(reset)
</script>

<template>
  <div class="flex shrink-0 items-center gap-1">
    <span role="status" class="max-w-36 text-xs" :class="state === 'error' ? 'text-error' : 'text-muted'">
      {{ state === 'success' ? '已复制' : state === 'error' ? '复制失败，请手动选择代码' : '' }}
    </span>
    <button type="button" class="icon-button" aria-label="复制代码" :disabled="state === 'copying'" @click="copyCode">
      <AppIcon :name="state === 'success' ? 'check' : 'copy'" />
    </button>
  </div>
</template>
