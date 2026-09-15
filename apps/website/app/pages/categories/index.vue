<script setup lang="ts">
definePageMeta({ section: 'categories', pageKind: 'index', pageTitle: '专栏' })
const { categories } = usePostCatalog()
useSeoMeta({ title: '专栏', description: '按专栏分类浏览文章。' })
usePostListActions()
</script>

<template>
  <div>
    <PageHeading title="专栏" />
    <PostCollection>
      <template #toolbar-start>
        <CategoryNavigation :categories="categories" selected="" />
      </template>
    </PostCollection>
  </div>
</template>
