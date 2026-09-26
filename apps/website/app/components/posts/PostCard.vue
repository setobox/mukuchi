<script setup lang="ts">
import type { PostSummary } from '~~/shared/content/schema'

defineProps<{ post: PostSummary }>()
</script>

<template>
  <article
    class="min-w-0 flex flex-col overflow-hidden border border-line rounded-panel bg-surface"
  >
    <NuxtLink v-if="post.cover" :to="post.path" tabindex="-1" aria-hidden="true" class="ui-feedback active:opacity-75 hover:opacity-85">
      <img
        :src="post.cover"
        alt=""
        loading="lazy"
        width="640"
        height="360"
        class="aspect-video h-auto w-full object-cover"
      >
    </NuxtLink>
    <div class="min-w-0 flex flex-1 flex-col p-5 md:p-6">
      <h2 class="text-title text-themed font-bold">
        <NuxtLink :to="post.path" class="ui-link block max-w-full min-h-11 truncate md:min-h-0">
          {{ post.title }}
        </NuxtLink>
      </h2>
      <PostMeta :post="post" class="mt-2" />
      <p :title="post.description" class="line-clamp-2 mb-5 mt-3 break-words">
        {{ post.description }}
      </p>
      <PostTags :tags="post.tags" class="mt-auto" />
    </div>
  </article>
</template>
