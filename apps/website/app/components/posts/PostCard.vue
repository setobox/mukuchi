<script setup lang="ts">
import type { PostSummary } from '~~/shared/content/schema'

defineProps<{ post: PostSummary }>()
</script>

<template>
  <article
    class="min-w-0 flex flex-col overflow-hidden border border-line rounded-panel bg-surface"
  >
    <NuxtLink v-if="post.cover" :to="post.path" tabindex="-1" aria-hidden="true">
      <img
        :src="post.cover"
        alt=""
        loading="lazy"
        width="640"
        height="360"
        class="aspect-video h-auto w-full object-cover"
      >
    </NuxtLink>
    <div class="flex flex-1 flex-col p-5 md:p-6">
      <PostMeta :post="post" />
      <h2 class="mt-3 text-title text-themed font-bold">
        <NuxtLink :to="post.path" class="break-words transition-colors hover:text-accent-soft">
          {{ post.title }}
        </NuxtLink>
      </h2>
      <p class="mb-5 mt-3 break-words">
        {{ post.description }}
      </p>
      <PostTags :tags="post.tags" class="mt-auto" />
    </div>
  </article>
</template>
