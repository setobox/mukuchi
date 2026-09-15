<script setup lang="ts">
import { taxonomyTitle } from '#shared/content/taxonomy'

definePageMeta({
  section: 'categories',
  pageKind: 'index',
  pageTitle: route => taxonomyTitle('category', route.params.name),
  parentPath: '/categories',
  key: route => route.path,
})
const { filter, categories } = await useTaxonomyPage('category')
</script>

<template>
  <TaxonomyPostPage v-if="filter" :filter="filter" :categories="categories" />
</template>
