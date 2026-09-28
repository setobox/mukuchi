<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{ src: string, name: string }>()
const failed = ref(false)
watch(() => props.src, () => failed.value = false)
</script>

<template>
  <span class="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-surface text-accent-soft">
    <img v-if="src && !failed" :src="src" :alt="name" class="h-full w-full object-cover" referrerpolicy="no-referrer" @error="failed = true">
    <span v-else class="i-lucide-user-round size-[55%]" aria-hidden="true" />
  </span>
</template>
