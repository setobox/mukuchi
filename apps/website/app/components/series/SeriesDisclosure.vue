<script setup lang="ts">
import type { PostSeries } from '#shared/content/series'
import { computed } from 'vue'
import AppIcon from '../AppIcon.vue'
import BaseCollapsible from '../base/BaseCollapsible.vue'

const props = withDefaults(defineProps<{ group: PostSeries, currentPath?: string, open?: boolean }>(), { open: undefined })
defineEmits<{ 'update:open': [open: boolean] }>()
const position = computed(() => props.group.posts.findIndex(post => post.path === props.currentPath) + 1)
</script>

<template>
  <BaseCollapsible :open="open" class="border border-line rounded-panel p-2" @update:open="$emit('update:open', $event)">
    <template #trigger="{ open: expanded }">
      <button type="button" class="control-quiet min-h-16 w-full flex items-center gap-3 px-3 py-3 text-left" :aria-label="`${group.name}，${group.posts.length} 篇文章${position ? `，当前第 ${position} 篇` : ''}`">
        <span class="h-10 w-10 flex shrink-0 items-center justify-center rounded-button bg-accent-surface text-accent-soft" aria-hidden="true"><AppIcon name="list" class="text-xl" /></span>
        <span class="min-w-0 flex-1">
          <span v-if="currentPath" class="mb-1 block text-xs text-muted">所属系列</span>
          <span class="block break-words text-title text-heading font-medium">{{ group.name }}</span>
          <span class="mt-1 block text-sm text-muted">{{ group.posts.length }} 篇文章<span v-if="position"> · 正在阅读第 {{ position }} 篇</span></span>
        </span>
        <AppIcon name="down" class="shrink-0 text-muted transition-transform duration-[var(--duration-interaction)] motion-reduce:transition-none" :class="{ '-rotate-90': !expanded }" />
      </button>
    </template>
    <ol class="m-0 list-none px-1 pb-1 pt-2">
      <li v-for="(post, index) in group.posts" :key="post.path">
        <NuxtLink
          :to="post.path" :aria-current="post.path === currentPath ? 'page' : undefined"
          class="control-quiet min-h-11 flex items-baseline gap-3 px-3 py-3"
          :class="post.path === currentPath ? 'control-selected' : 'text-heading'"
        >
          <span class="min-w-6 shrink-0 text-sm text-muted font-mono tabular-nums"><span class="sr-only">第 </span>{{ index + 1 }}<span class="sr-only"> 篇：</span></span>
          <span class="min-w-0 flex-1 break-words">{{ post.title }}</span>
          <span v-if="post.path === currentPath" class="shrink-0 self-center text-xs">本文</span>
          <AppIcon v-else name="chevron" class="shrink-0 self-center text-muted" />
        </NuxtLink>
      </li>
    </ol>
  </BaseCollapsible>
</template>
