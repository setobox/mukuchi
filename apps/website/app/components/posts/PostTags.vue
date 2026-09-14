<script setup lang="ts">
defineProps<{ tags: string[] }>()
</script>

<template>
  <ul v-if="tags.length" class="m-0 flex flex-wrap list-none gap-2 p-0" aria-label="文章标签">
    <li v-for="tag in tags" :key="tag" class="max-w-full min-w-0">
      <NuxtLink
        :to="{ path: '/posts', query: { tag } }"
        class="max-w-full min-h-8 inline-flex items-center break-all border border-line rounded-md px-2.5 text-sm text-muted transition-colors hover:border-line-strong hover:text-heading"
      >
        {{ tag }}
      </NuxtLink>
    </li>
  </ul>
</template>
