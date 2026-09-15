<script setup lang="ts">
import type { TaxonomyFilter } from '#shared/content/taxonomy'
import { taxonomyTitle } from '#shared/content/taxonomy'

const props = defineProps<{ filter: TaxonomyFilter, categories: { name: string, count: number }[] }>()
const title = computed(() => taxonomyTitle(props.filter.kind, props.filter.name))
useSeoMeta({
  title,
  description: () => props.filter.kind === 'category' ? `浏览“${props.filter.name}”专栏的文章。` : `浏览带有“${props.filter.name}”标签的文章。`,
})
usePostListActions()
</script>

<template>
  <div>
    <PageHeading :title="title" />
    <PostCollection :filter="filter">
      <template v-if="filter.kind === 'category'" #toolbar-start>
        <CategoryNavigation :categories="categories" :selected="filter.name" />
      </template>
    </PostCollection>
  </div>
</template>
