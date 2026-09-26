<script setup lang="ts">
import { taxonomyPath } from '#shared/content/taxonomy'

withDefaults(
  defineProps<{
    tags: { name: string, count: number }[]
    selected?: string
  }>(),
  { selected: '' },
)
</script>

<template>
  <nav aria-label="标签筛选" class="flex flex-wrap gap-2">
    <NuxtLink
      v-for="tag in tags"
      :key="tag.name"
      :to="taxonomyPath('tag', tag.name)"
      class="chip-link"
      :class="
        selected === tag.name
          ? 'control-selected border-accent'
          : 'border-line text-muted'
      "
      :aria-current="selected === tag.name ? 'true' : undefined"
    >
      <span class="min-w-0 break-all"><span aria-hidden="true">#</span>{{ tag.name }}</span>
    </NuxtLink>
    <NuxtLink to="/tags" class="chip-link border-line text-muted">
      查看全部
    </NuxtLink>
  </nav>
</template>
