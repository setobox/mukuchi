<script setup lang="ts">
import type { PostSummary } from '#shared/content/schema'
import { formatPostDate } from '#shared/content/catalog'
import { readingMinutes } from '#shared/content/reading'
import { taxonomyPath } from '#shared/content/taxonomy'

withDefaults(defineProps<{ post: PostSummary, detailed?: boolean, views?: boolean }>(), { detailed: false, views: true })
</script>

<template>
  <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
    <span v-if="post.pin > 0" class="inline-flex items-center gap-1.5 text-accent-soft"><AppIcon name="pin" />置顶</span>
    <time v-if="!detailed" :datetime="post.publish">发布于 {{ formatPostDate(post.publish) }}</time>
    <template v-if="detailed">
      <span class="inline-flex items-center gap-1.5 whitespace-nowrap"><AppIcon name="wordCount" />共{{ post.wordCount }}字</span>
      <span class="inline-flex items-center gap-1.5 whitespace-nowrap"><AppIcon name="readingTime" />{{ readingMinutes(post.wordCount) }}分钟</span>
      <ArticleViews v-if="views" :path="post.path" />
    </template>
    <template v-if="!detailed">
      <NuxtLink
        v-for="category in post.categories"
        :key="category"
        :to="taxonomyPath('category', category)"
        class="chip-link min-w-0 break-all border-line text-muted"
      >
        <span class="min-w-0 break-all">{{ category }}</span>
      </NuxtLink>
    </template>
  </div>
</template>
