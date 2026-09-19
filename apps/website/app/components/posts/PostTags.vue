<script setup lang="ts">
import { taxonomyPath } from '#shared/content/taxonomy'

defineProps<{ tags: string[] }>()
</script>

<template>
  <ul v-if="tags.length" class="m-0 flex flex-wrap list-none gap-x-4 gap-y-1 p-0" aria-label="文章标签">
    <li v-for="tag in tags" :key="tag" class="max-w-full min-w-0">
      <NuxtLink
        :to="taxonomyPath('tag', tag)"
        class="ui-link max-w-full min-h-11 inline-flex items-center break-all text-sm text-muted md:min-h-8"
      >
        <span class="min-w-0"><span aria-hidden="true">#</span>{{ tag }}</span>
      </NuxtLink>
    </li>
  </ul>
</template>
