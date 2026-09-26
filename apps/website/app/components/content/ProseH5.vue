<script setup lang="ts">
import ArticleHeading from './ArticleHeading.vue'

defineProps<{ id?: string }>()
</script>

<template>
  <ArticleHeading :id="id" :level="5">
    <slot />
  </ArticleHeading>
</template>
