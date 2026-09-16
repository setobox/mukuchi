<script setup lang="ts">
import type { PageCollectionItemBase } from '@nuxt/content'
import ArticleBody from './ArticleBody.vue'

defineOptions({ inheritAttrs: false })
defineProps<{ value: PageCollectionItemBase }>()
</script>

<template>
  <ArticleBody v-bind="$attrs" :content-key="value.id">
    <ContentRenderer :value="value" />
  </ArticleBody>
</template>
