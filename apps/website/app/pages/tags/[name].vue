<script setup lang="ts">
import { taxonomyTitle } from '#shared/content/taxonomy'

definePageMeta({
  section: 'posts',
  pageKind: 'index',
  pageTitle: route => taxonomyTitle('tag', route.params.name),
  parentPath: '/posts',
  key: route => route.path,
})
const { filter, categories } = await useTaxonomyPage('tag')
</script>

<template>
  <TaxonomyPostPage v-if="filter" :filter="filter" :categories="categories" />
</template>
