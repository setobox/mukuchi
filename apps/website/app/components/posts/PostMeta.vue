<script setup lang="ts">
import type { PostSummary } from '~~/shared/content/schema'
import { formatPostDate } from '~~/shared/content/catalog'

withDefaults(defineProps<{ post: PostSummary, detailed?: boolean }>(), { detailed: false })
</script>

<template>
  <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
    <span v-if="post.pin > 0" class="inline-flex items-center gap-1.5 text-accent-soft"><AppIcon name="pin" />置顶</span>
    <time :datetime="post.publish">发布于 {{ formatPostDate(post.publish) }}</time>
    <time v-if="detailed && post.update" :datetime="post.update">更新于 {{ formatPostDate(post.update) }}</time>
    <NuxtLink
      v-for="category in post.categories"
      :key="category"
      :to="{ path: '/categories', query: { category } }"
      class="min-h-8 inline-flex items-center hover:text-heading"
    >
      {{ category }}
    </NuxtLink>
  </div>
</template>
