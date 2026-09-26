<script setup lang="ts">
import type { PostSummary } from '#shared/content/schema'
import { computed } from 'vue'
import { archiveYears } from '#shared/content/browse'
import AppIcon from '../AppIcon.vue'
import BaseCollapsible from '../base/BaseCollapsible.vue'

const props = defineProps<{ posts: Pick<PostSummary, 'path' | 'title' | 'publish' | 'stem'>[] }>()
const years = computed(() => archiveYears(props.posts))
</script>

<template>
  <section aria-label="文章时间线">
    <p class="mb-4 border-b border-line pb-5 text-muted">
      共 {{ posts.length }} 篇文章 · {{ years.length }} 个年份
    </p>
    <BaseCollapsible v-for="(group, index) in years" :key="group.year" :default-open="index === 0" class="border-b border-line pb-3 pt-2">
      <template #trigger="{ open }">
        <button type="button" class="control-quiet min-h-14 w-full flex items-center gap-3 px-3 py-3 text-left" :aria-label="`${group.year} 年，${group.articles.length} 篇文章`">
          <span class="text-section text-heading font-mono tabular-nums">{{ group.year }}</span>
          <span class="flex-1 text-sm text-muted">{{ group.articles.length }} 篇</span>
          <AppIcon name="down" class="transition-transform duration-[var(--duration-interaction)] motion-reduce:transition-none" :class="{ '-rotate-90': !open }" />
        </button>
      </template>
      <ol class="my-0 ml-5 mr-0 list-none border-l border-line-strong pb-3 pl-5 pt-1">
        <li v-for="post in group.articles" :key="post.path" class="py-1">
          <NuxtLink :to="post.path" class="archive-entry ui-feedback relative min-h-11 flex items-baseline gap-3 rounded-button px-3 py-2.5 md:gap-5">
            <span class="archive-dot" aria-hidden="true" />
            <time :datetime="post.publish" class="shrink-0 text-sm text-muted font-mono tabular-nums">{{ post.publish.slice(5) }}</time>
            <span class="archive-title min-w-0 flex-1 break-words text-heading">{{ post.title }}</span>
            <AppIcon name="chevron" class="archive-arrow shrink-0 self-center" />
          </NuxtLink>
        </li>
      </ol>
    </BaseCollapsible>
  </section>
</template>

<style scoped>
.archive-dot {
  position: absolute;
  top: 1.15rem;
  left: -1.5625rem;
  width: 9px;
  height: 9px;
  border: 2px solid var(--color-border-strong);
  border-radius: 50%;
  background: var(--color-canvas);
}
.archive-dot, .archive-title, .archive-arrow {
  transition: transform var(--duration-interaction) var(--ease-interaction), color var(--duration-interaction) var(--ease-interaction), background-color var(--duration-interaction) var(--ease-interaction), border-color var(--duration-interaction) var(--ease-interaction), opacity var(--duration-interaction) var(--ease-interaction);
}
.archive-arrow { opacity: 0; transform: translateX(-3px); }
.archive-entry:is(:hover, :focus-visible) { background: var(--color-accent-surface); color: var(--color-accent-text); }
.archive-entry:is(:hover, :focus-visible) .archive-title { transform: translateX(3px); color: inherit; }
.archive-entry:is(:hover, :focus-visible) .archive-dot { transform: scale(1.3); border-color: var(--color-accent); background: var(--color-accent); }
.archive-entry:is(:hover, :focus-visible) .archive-arrow { opacity: 1; transform: translateX(0); }
.archive-entry:active { background: var(--color-accent-pressed); }
@media (prefers-reduced-motion: reduce) {
  .archive-dot, .archive-title, .archive-arrow { transition: none; transform: none !important; }
}
</style>
