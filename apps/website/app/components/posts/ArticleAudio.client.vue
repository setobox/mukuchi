<script setup lang="ts">
import type { PublicAudio } from '#shared/audio/model'
import { useDocumentVisibility, useIntervalFn } from '@vueuse/core'

const props = defineProps<{ path: string }>()
const config = useRuntimeConfig()
const items = ref<PublicAudio[]>([])
const visibility = useDocumentVisibility()
const enabled = config.public.audioEnabled === true || String(config.public.audioEnabled) === 'true'
let pending = false
let disposed = false
let controller: AbortController | undefined
async function refresh() {
  if (!enabled || pending || visibility.value === 'hidden')
    return
  pending = true
  const path = props.path
  const active = controller = new AbortController()
  try {
    const result = await $fetch<{ items: PublicAudio[] }>(`${config.app.baseURL.replace(/\/$/, '')}/api/audio`, { query: { path }, signal: active.signal, timeout: 10_000, retry: 0 })
    if (!disposed && !active.signal.aborted && path === props.path)
      items.value = result.items
  }
  catch { /* Audio availability must never interrupt article reading. */ }
  finally {
    if (controller === active)
      pending = false
  }
}
onMounted(refresh)
watch(() => props.path, () => {
  controller?.abort()
  pending = false
  items.value = []
  void refresh()
}, { flush: 'sync' })
useIntervalFn(refresh, 30_000, { immediate: enabled })
onBeforeUnmount(() => {
  disposed = true
  controller?.abort()
})
</script>

<template>
  <AudioPlayer v-if="items.length" :items="items" class="mt-8" />
</template>
