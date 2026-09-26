<script setup lang="ts">
import type { PostSummary } from '~~/shared/content/schema'

defineProps<{ post: PostSummary }>()
</script>

<template>
  <article class="min-w-0 flex gap-3 border border-line rounded-panel bg-surface p-2 md:gap-6 md:p-4">
    <div class="min-w-0 flex-1 py-2 pl-2 md:pl-3">
      <h2 class="text-title text-themed font-bold">
        <NuxtLink :to="post.path" class="ui-link inline-block max-w-full min-h-11 break-words md:min-h-0">
          {{ post.title }}
        </NuxtLink>
      </h2>
      <PostMeta :post="post" class="mt-2" />
      <p class="mt-2 break-words text-ink">
        {{ post.description }}
      </p>
      <PostTags :tags="post.tags" class="mt-4" />
    </div>
    <NuxtLink
      v-if="post.cover"
      :to="post.path"
      tabindex="-1"
      aria-hidden="true"
      class="ui-feedback relative max-w-[42%] w-36 shrink-0 self-stretch overflow-hidden rounded-panel md:aspect-video md:max-w-[300px] md:w-[30%] md:self-start active:opacity-75 hover:opacity-85"
    >
      <img
        :src="post.cover"
        alt=""
        loading="lazy"
        width="640"
        height="360"
        class="absolute inset-0 h-full w-full object-cover object-center"
      >
    </NuxtLink>
  </article>
</template>
