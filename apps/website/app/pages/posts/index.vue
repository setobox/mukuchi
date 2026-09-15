<script setup lang="ts">
definePageMeta({ section: 'posts', pageKind: 'index', pageTitle: '文章' })
useSeoMeta({ title: '文章', description: '浏览本站发布的全部文章。' })

usePostListActions()
</script>

<template>
  <div>
    <PageHeading title="文章" />
    <PostCollection />
  </div>
</template>
