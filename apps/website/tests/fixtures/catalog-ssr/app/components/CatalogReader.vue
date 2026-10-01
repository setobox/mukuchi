<script setup lang="ts">
defineProps<{ name: string }>()
const catalog = usePostCatalog()
await catalog.ready
</script>

<template>
  <span :data-reader="name">{{ catalog.data.value?.[0]?.title }}</span>
</template>
