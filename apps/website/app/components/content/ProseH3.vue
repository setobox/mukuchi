<script setup lang="ts">
import ArticleHeading from './ArticleHeading.vue'

defineProps<{ id?: string }>()
</script>

<template>
  <ArticleHeading :id="id" :level="3">
    <slot />
  </ArticleHeading>
</template>
