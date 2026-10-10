<script setup lang="ts">
import type { AssistantBlock, AssistantMessage } from '#shared/assistant/model'
import { computed, onBeforeUnmount, watch } from 'vue'
import { useAssistantMotion } from '~/features/assistant/motion'
import AssistantPresentation from './AssistantPresentation.vue'
import AssistantSources from './AssistantSources.vue'
import AssistantText from './AssistantText.vue'

const props = defineProps<{
  message: AssistantMessage
  busy?: boolean
  animate?: boolean
  portalTarget?: HTMLElement
  theme?: 'light' | 'dark'
  actionBusy?: boolean
  navigationResults?: Record<string, 'succeeded' | 'failed' | 'cancelled'>
}>()
const emit = defineEmits<{ suggestion: [text: string], navigate: [actionId: string] }>()
const motion = useAssistantMotion()
const blocks = computed(() => props.message.blocks.filter(Boolean))
const sourceIds = (block: AssistantBlock) => 'sourceIds' in block ? block.sourceIds ?? [] : []
const sources = (block: AssistantBlock) => props.message.references.filter(ref => ref.sourceId && sourceIds(block).includes(ref.sourceId))
const unplacedSources = computed(() => props.message.references.filter(ref => !ref.sourceId || !blocks.value.some(block => sourceIds(block).includes(ref.sourceId!))))
const resultLabel = { succeeded: '已打开文章', failed: '打开失败，请重新选择', cancelled: '已取消打开' }
function enter(element: Element, done: () => void) {
  void motion.enter(element, done, Number((element as HTMLElement).dataset.suggestionIndex ?? 0) * 0.04)
}
watch(() => props.message.id, motion.reset)
onBeforeUnmount(motion.reset)
</script>

<template>
  <div class="assistant-message" :aria-busy="busy || undefined">
    <TransitionGroup tag="div" class="assistant-message-blocks" :css="false" :appear="animate" @enter="enter">
      <div v-for="(block, index) in blocks" :key="index" class="assistant-message-block">
        <AssistantText v-if="block.type === 'text'" :text="block.text" />
        <div v-else-if="block.type === 'article_list'" class="assistant-cards">
          <NuxtLink v-for="item in block.items" :key="item.articleId" :to="item.path" class="assistant-card">
            <span class="i-lucide-book-open text-accent-soft" aria-hidden="true" /><strong>{{ item.title }}</strong><span>{{ item.description }}</span><span class="text-accent-soft">阅读文章 →</span>
          </NuxtLink>
        </div>
        <div v-else-if="block.type === 'taxonomy_list'" class="flex flex-wrap gap-2">
          <NuxtLink v-for="item in block.items" :key="item.path" :to="item.path" class="assistant-suggestion">
            {{ item.name }} · {{ item.count }}
          </NuxtLink>
        </div>
        <div v-else-if="block.type === 'navigation_confirmation'">
          <p v-if="navigationResults?.[block.actionId]" class="text-xs text-muted">
            {{ resultLabel[navigationResults[block.actionId]!] }}
          </p>
          <button v-else class="assistant-suggestion" type="button" :disabled="actionBusy || busy || block.expiresAt < Date.now()" @click="emit('navigate', block.actionId)">
            打开《{{ block.target.title }}》<span class="i-lucide-arrow-up-right" aria-hidden="true" />
          </button>
        </div>
        <p v-else-if="block.type === 'navigation_result'" class="text-xs text-muted">
          {{ resultLabel[block.status] }}
        </p>
        <AssistantPresentation v-else :block="block" :theme="theme" />
        <AssistantSources v-if="sources(block).length" :sources="sources(block)" :portal-target="portalTarget" />
      </div>
    </TransitionGroup>
    <div v-if="unplacedSources.length" class="assistant-legacy-sources">
      <span>参考文章</span><AssistantSources :sources="unplacedSources" :portal-target="portalTarget" />
    </div>
    <TransitionGroup tag="div" class="assistant-followups" :css="false" @enter="enter">
      <button v-for="(suggestion, index) in busy ? [] : message.suggestions ?? []" :key="suggestion" :data-suggestion-index="index" type="button" class="assistant-suggestion" @click="emit('suggestion', suggestion)">
        {{ suggestion }}<span class="i-lucide-corner-down-left shrink-0" aria-hidden="true" />
      </button>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.assistant-message { min-width: 0; line-height: 1.8; overflow-wrap: anywhere; }
.assistant-message-blocks { display: flex; flex-direction: column; gap: 20px; }
.assistant-message-block { min-width: 0; }
.assistant-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr)); gap: 10px; }
.assistant-card { display: flex; flex-direction: column; gap: .5rem; padding: 16px; border: 1px solid var(--color-border); border-radius: 12px; font-size: .85em; transition: background .18s, border-color .18s; }
.assistant-card:hover { background: var(--color-accent-surface); border-color: var(--color-accent); }
.assistant-card > span:not(:last-child):not(:first-child) { color: var(--color-muted); }
.assistant-suggestion { display: inline-flex; align-items: center; justify-content: space-between; gap: .6rem; min-height: 36px; padding: 6px 12px; border: 1px solid var(--color-border); border-radius: 10px; font-size: 12px; line-height: 1.6; text-align: left; color: var(--color-text); transition: background .18s, border-color .18s; }
.assistant-suggestion:hover { background: var(--color-accent-surface); border-color: var(--color-accent); }
.assistant-suggestion:disabled { opacity: .45; cursor: default; }
.assistant-followups { display: flex; flex-wrap: wrap; gap: 8px; }
.assistant-followups:not(:empty) { padding-top: 18px; margin-top: 18px; border-top: 1px solid var(--color-border); }
.assistant-legacy-sources { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 16px; font-size: 11px; color: var(--color-muted); }
@media (prefers-reduced-motion: reduce) { .assistant-card,.assistant-suggestion { transition: none; } }
</style>
