<script setup lang="ts">
import type { PostMeta } from '#shared/content/schema'

withDefaults(defineProps<{ post: PostMeta & { path: string }, preview?: boolean }>(), { preview: false })
</script>

<template>
  <header class="border-b border-line pb-8">
    <PostMeta :post="post" detailed :views="!preview" />
    <h1 class="my-5 break-words text-page text-themed leading-tight">
      {{ post.title }}
    </h1>
    <p v-if="post.summarySource !== 'ai'" class="mb-6 text-muted leading-8">
      {{ post.description }}
    </p>
    <PostTags :tags="post.tags" />
    <ArticleNotices :post="post" :path="post.path" />
    <img v-if="post.cover" :src="post.cover" alt="" width="1200" height="675" class="mt-7 aspect-video h-auto w-full rounded-panel object-cover">
  </header>
</template>
