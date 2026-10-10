<script setup lang="ts">
import type { ArticleReference } from '#shared/assistant/model'
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { onBeforeUnmount, ref } from 'vue'
import { useAssistantMotion } from '~/features/assistant/motion'

defineProps<{ sources: ArticleReference[], portalTarget?: HTMLElement }>()
const open = ref(false)
const motion = useAssistantMotion()
let timer: ReturnType<typeof setTimeout> | undefined
function show() {
  clearTimeout(timer)
  open.value = true
}
function hide() {
  clearTimeout(timer)
  timer = setTimeout(() => {
    open.value = false
  }, 160)
}
function focus(event: FocusEvent) {
  if ((event.target as HTMLElement).matches(':focus-visible'))
    show()
}
function enter(element: Element, done: () => void) {
  // Floating UI owns the wrapper transform; animate only the inner card.
  void motion.enter(element.querySelector('.assistant-source-popover') ?? element, done)
}
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <PopoverRoot v-if="sources.length" v-model:open="open">
    <PopoverTrigger as-child>
      <button type="button" class="assistant-source-tag" aria-label="查看本段来源" @mouseenter="show" @mouseleave="hide" @focus="focus" @click="show">
        <span class="i-lucide-book-open shrink-0" aria-hidden="true" /><span class="truncate">{{ sources[0]!.title }}</span><span v-if="sources.length > 1" class="shrink-0">+{{ sources.length - 1 }}</span>
      </button>
    </PopoverTrigger>
    <PopoverPortal :to="portalTarget">
      <Transition :css="false" @enter="enter">
        <PopoverContent as-child :side-offset="7" :collision-padding="12" align="start" @mouseenter="show" @mouseleave="hide" @open-auto-focus.prevent @close-auto-focus.prevent>
          <div class="assistant-source-popover">
            <NuxtLink v-for="source in sources" :key="`${source.articleId}:${source.sectionId}`" :to="`${source.path}${source.sectionId ? `#${encodeURIComponent(source.sectionId)}` : ''}`" class="assistant-source-link" @click="open = false">
              <span class="flex items-center gap-2 text-xs text-muted"><span class="i-lucide-book-open" aria-hidden="true" />Setobox Blog · 文章来源</span>
              <strong>{{ source.title }}</strong>
              <span v-if="source.sectionTitle" class="text-xs text-accent-soft">{{ source.sectionTitle }}</span>
              <span v-if="source.excerpt" class="assistant-source-excerpt">{{ source.excerpt }}</span>
              <span class="text-xs text-accent-soft">阅读原文 ↗</span>
            </NuxtLink>
          </div>
        </PopoverContent>
      </Transition>
    </PopoverPortal>
  </PopoverRoot>
</template>

<style scoped>
.assistant-source-tag { display: inline-flex; align-items: center; gap: .3rem; max-width: 13rem; padding: .16rem .5rem; margin-top: .3rem; border-radius: 999px; background: var(--color-code); color: var(--color-muted); font-size: 11px; line-height: 1.55; vertical-align: middle; cursor: pointer; }
.assistant-source-tag:hover, .assistant-source-tag:focus-visible { color: var(--color-heading); background: var(--color-accent-surface); }
.assistant-source-popover { z-index: 100; width: min(340px, calc(100vw - 32px)); max-height: min(420px, var(--reka-popover-content-available-height)); overflow-y: auto; border: 1px solid var(--color-border-strong); border-radius: var(--radius-panel); background: var(--color-surface); box-shadow: var(--shadow-dialog); color: var(--color-text); }
.assistant-source-link { display: flex; flex-direction: column; gap: .45rem; padding: 1rem; }
.assistant-source-link + .assistant-source-link { border-top: 1px solid var(--color-border); }
.assistant-source-link:hover { background: var(--color-accent-surface); }
.assistant-source-excerpt { font-size: .8rem; line-height: 1.6; color: var(--color-muted); display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
</style>
