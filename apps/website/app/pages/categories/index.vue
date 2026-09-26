<script setup lang="ts">
definePageMeta({ section: 'categories', pageKind: 'index', pageTitle: '分类' })
const { categories } = usePostCatalog()
useSeoMeta({ title: '分类', description: '按分类浏览文章。' })
usePostListActions()
</script>

<template>
  <div>
    <PageHeading title="分类" />
    <PostCollection>
      <template #toolbar-start>
        <CategoryNavigation :categories="categories" selected="" />
      </template>
    </PostCollection>
  </div>
</template>
