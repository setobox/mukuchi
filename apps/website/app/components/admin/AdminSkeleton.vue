<script setup lang="ts">
withDefaults(defineProps<{ label?: string }>(), { label: '正在加载…' })
</script>

<template>
  <div role="status" aria-busy="true" class="space-y-3">
    <span class="sr-only">{{ label }}</span>
    <div v-for="row in 4" :key="row" class="h-20 animate-pulse border border-line rounded-panel bg-surface motion-reduce:animate-none" aria-hidden="true" />
  </div>
</template>
