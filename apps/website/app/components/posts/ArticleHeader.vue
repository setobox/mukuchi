<script setup lang="ts">
import type { PostMeta } from '#shared/content/schema'
import { formatPostDate } from '#shared/content/catalog'
import { taxonomyPath } from '#shared/content/taxonomy'

withDefaults(defineProps<{ post: PostMeta & { path: string }, preview?: boolean }>(), { preview: false })
</script>

<template>
  <header class="border-b border-line pb-8">
    <PostMeta :post="post" detailed :views="!preview" />
    <h1 class="my-5 break-words text-page text-themed leading-tight">
      {{ post.title }}
    </h1>
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
      <time
        :datetime="post.publish"
        :title="`发布于 ${formatPostDate(post.publish)}`"
        :aria-label="`发布于 ${formatPostDate(post.publish)}`"
        class="ui-feedback inline-flex items-center gap-1.5 whitespace-nowrap hover:text-accent-soft"
      >
        <AppIcon name="published" />{{ formatPostDate(post.publish) }}
      </time>
      <time
        v-if="post.update"
        :datetime="post.update"
        :title="`更新于 ${formatPostDate(post.update)}`"
        :aria-label="`更新于 ${formatPostDate(post.update)}`"
        class="ui-feedback inline-flex items-center gap-1.5 whitespace-nowrap hover:text-accent-soft"
      >
        <AppIcon name="updated" />{{ formatPostDate(post.update) }}
      </time>
      <div v-if="post.categories.length" role="group" aria-label="文章分类" class="max-w-full min-w-0 flex items-start gap-1.5">
        <span class="min-h-11 inline-flex shrink-0 items-center md:min-h-8"><AppIcon name="folder" /></span>
        <div class="min-w-0 flex flex-wrap gap-2">
          <NuxtLink
            v-for="category in post.categories"
            :key="category"
            :to="taxonomyPath('category', category)"
            class="chip-link min-w-0 break-all border-line text-muted"
          >
            <span class="min-w-0 break-all">{{ category }}</span>
          </NuxtLink>
        </div>
      </div>
      <div v-if="post.tags.length" class="max-w-full min-w-0 flex items-start gap-1.5">
        <span class="min-h-11 inline-flex shrink-0 items-center md:min-h-8"><AppIcon name="tags" /></span>
        <PostTags :tags="post.tags" class="min-w-0" />
      </div>
    </div>
    <ArticleNotices :post="post" :path="post.path" />
    <img v-if="post.cover" :src="post.cover" alt="" width="1200" height="675" class="mt-7 h-80 w-full rounded-panel object-cover object-center md:h-120">
  </header>
</template>
