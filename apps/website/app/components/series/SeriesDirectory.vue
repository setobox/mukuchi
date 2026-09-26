<script setup lang="ts">
import type { PostSeries } from '#shared/content/series'
import { computed, ref } from 'vue'
import SeriesDisclosure from './SeriesDisclosure.vue'

const props = defineProps<{ groups: PostSeries[] }>()
const expanded = ref<string | null>(null)
const count = computed(() => props.groups.reduce((total, group) => total + group.posts.length, 0))
</script>

<template>
  <section aria-label="系列目录">
    <p class="mb-5 border-b border-line pb-5 text-muted">
      共 {{ groups.length }} 个系列 · {{ count }} 篇文章
    </p>
    <div class="flex flex-col gap-4">
      <SeriesDisclosure v-for="group in groups" :key="group.name" :group="group" :open="expanded === group.name" @update:open="expanded = $event ? group.name : expanded === group.name ? null : expanded" />
    </div>
  </section>
</template>
