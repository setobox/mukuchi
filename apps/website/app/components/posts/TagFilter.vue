<script setup lang="ts">
withDefaults(
  defineProps<{
    tags: { name: string, count: number }[]
    selected?: string
    base?: string
    category?: string
  }>(),
  { selected: '', base: '/posts', category: '' },
)
</script>

<template>
  <nav aria-label="标签筛选" class="flex flex-wrap gap-2">
    <NuxtLink
      :to="{ path: base, query: { category: category || undefined } }"
      class="min-h-9 inline-flex items-center border rounded-lg px-3 text-sm"
      :class="
        !selected
          ? 'border-accent bg-accent-surface text-accent-soft'
          : 'border-line text-muted hover:text-heading'
      "
      :aria-current="!selected ? 'true' : undefined"
    >
      全部标签
    </NuxtLink>
    <NuxtLink
      v-for="tag in tags"
      :key="tag.name"
      :to="{ path: base, query: { category: category || undefined, tag: tag.name } }"
      class="max-w-full min-h-9 inline-flex items-center gap-2 border rounded-lg px-3 text-sm"
      :class="
        selected === tag.name
          ? 'border-accent bg-accent-surface text-accent-soft'
          : 'border-line text-muted hover:text-heading'
      "
      :aria-current="selected === tag.name ? 'true' : undefined"
    >
      <span class="min-w-0 break-words">{{ tag.name }}</span><span class="shrink-0 text-muted font-mono">{{ tag.count }}</span>
    </NuxtLink>
  </nav>
</template>
