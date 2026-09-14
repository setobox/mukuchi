<script setup lang="ts">
import type { PostSummary } from '~~/shared/content/schema'

defineProps<{ post: PostSummary }>()
</script>

<template>
  <article class="flex gap-5 border-b border-line py-7 md:gap-7">
    <div class="min-w-0 flex-1">
      <PostMeta :post="post" />
      <h2 class="mt-2 text-title text-themed font-bold">
        <NuxtLink :to="post.path" class="break-words transition-colors hover:text-accent-soft">
          {{ post.title }}
        </NuxtLink>
      </h2>
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
      class="hidden w-36 shrink-0 self-start overflow-hidden rounded-xl md:block"
    >
      <img
        :src="post.cover"
        alt=""
        loading="lazy"
        width="288"
        height="192"
        class="aspect-[3/2] h-auto w-full object-cover"
      >
    </NuxtLink>
  </article>
</template>
