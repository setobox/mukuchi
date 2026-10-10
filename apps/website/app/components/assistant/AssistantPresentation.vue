<script setup lang="ts">
import type { PresentationBlock } from '#shared/assistant/presentation'
import { presentationIcons } from '#shared/assistant/presentation'
import AssistantArchitecture from './AssistantArchitecture.vue'
import AssistantHtml from './AssistantHtml.vue'

defineProps<{ block: PresentationBlock, theme?: 'light' | 'dark' }>()
</script>

<template>
  <section class="assistant-presentation" :class="`assistant-presentation-${block.type}`">
    <h3>{{ block.title }}</h3>
    <AssistantArchitecture v-if="block.type === 'architecture'" :block="block" />
    <div v-else-if="block.type === 'checklist'" class="assistant-checklist">
      <div v-for="(item, index) in block.items" :key="index" class="assistant-detail-row">
        <span :class="[presentationIcons[item.icon], `tone-${item.tone}`]" class="assistant-detail-icon" aria-hidden="true" /><div><h4>{{ item.title }}</h4><p>{{ item.description }}</p></div>
      </div>
    </div>
    <div v-else-if="block.type === 'comparison'" class="assistant-comparison">
      <div v-for="(item, index) in block.items" :key="index" class="assistant-detail-row">
        <span :class="presentationIcons[item.icon]" class="assistant-detail-icon" aria-hidden="true" /><div>
          <h4>{{ item.title }}</h4><span v-if="item.badge" class="assistant-badge">{{ item.badge }}</span><p>{{ item.description }}</p><ul v-if="item.points.length">
            <li v-for="point in item.points" :key="point">
              {{ point }}
            </li>
          </ul>
        </div>
      </div>
    </div>
    <figure v-else-if="block.type === 'media'" class="assistant-media">
      <img v-if="block.image" :src="block.image" :alt="block.title" loading="lazy" @error="($event.target as HTMLImageElement).hidden = true">
      <span v-else class="assistant-media-placeholder i-lucide-book-image" aria-hidden="true" />
      <figcaption>
        {{ block.summary }}<NuxtLink :to="block.articleId" class="mt-2 block text-sm text-accent-soft">
          阅读相关文章 →
        </NuxtLink>
      </figcaption>
    </figure>
    <div v-else-if="block.type === 'workflow'" class="assistant-workflow-demo">
      <div>
        <h4 class="mb-4 flex items-center gap-2">
          <span class="i-lucide-workflow" aria-hidden="true" />Workflow
        </h4><template v-for="(step, index) in block.steps" :key="index">
          <div class="assistant-step" :class="{ 'is-active': step.state === 'active', 'is-done': step.state === 'done' }">
            {{ step.label }}
          </div><div v-if="index < block.steps.length - 1" class="my-2 text-center text-muted" aria-hidden="true">
            ↓
          </div>
        </template>
      </div>
      <div>
        <h4 class="mb-4 flex items-center gap-2">
          <span class="i-lucide-messages-square" aria-hidden="true" />对话演示
        </h4><div class="assistant-demo-messages">
          <p v-for="(message, index) in block.messages" :key="index" :class="`demo-${message.role}`">
            {{ message.text }}
          </p>
        </div><p class="mt-4 text-xs text-muted">
          当前节点：{{ block.current }}
        </p>
      </div>
    </div>
    <AssistantHtml v-else-if="block.type === 'html'" :block="block" :theme="theme" />
    <p v-if="block.summary && block.type !== 'media'" class="assistant-presentation-summary">
      {{ block.summary }}
    </p>
  </section>
</template>

<style scoped>
.assistant-presentation { container-type: inline-size; min-width: 0; overflow-wrap: anywhere; }
.assistant-presentation > h3 { font-size: 1.12em; font-weight: 650; margin-bottom: 1rem; }
.assistant-presentation :is(h4,strong) { font-weight: 650; }
.assistant-detail-row { display: flex; align-items: flex-start; gap: 16px; padding: 20px 0; }
.assistant-detail-row + .assistant-detail-row { border-top: 1px solid var(--color-border); }
.assistant-detail-row:first-child { padding-top: 0; }
.assistant-detail-row p { margin-top: .4rem; color: var(--color-muted); line-height: 1.7; }
.assistant-detail-row ul { margin-top: .5rem; color: var(--color-muted); list-style: disc; padding-left: 1.1rem; font-size: .9em; }
.assistant-detail-icon { flex-shrink: 0; font-size: 22px; margin-top: 3px; }
.tone-positive { color: var(--color-success); }.tone-warning { color: var(--color-warn); }.tone-neutral { color: var(--color-muted); }
.assistant-badge { display: inline-block; margin-top: .4rem; font-size: .75em; color: var(--color-accent); background: var(--color-accent-surface); border-radius: 999px; padding: .1rem .5rem; }
.assistant-presentation-architecture, .assistant-presentation-workflow { border: 1px solid var(--color-border); border-radius: 12px; padding: 20px; }
.assistant-presentation-summary { margin-top: 1rem; color: var(--color-muted); line-height: 1.7; font-size: .9em; }
.assistant-media { display: flex; gap: 20px; align-items: flex-start; }
.assistant-media img { width: 28%; max-width: 220px; border-radius: 12px; object-fit: cover; aspect-ratio: 4/3; }
.assistant-media figcaption { flex: 1; min-width: 0; line-height: 1.8; }
.assistant-media-placeholder { font-size: 64px; color: var(--color-muted); }
.assistant-workflow-demo { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
.assistant-workflow-demo > div { min-width: 0; }
.assistant-step { text-align: center; background: var(--color-code); border: 1px solid transparent; border-radius: 8px; padding: 10px; font-size: .9em; }
.assistant-step.is-active { background: var(--color-accent-surface); border-color: var(--color-accent); }
.assistant-demo-messages { display: flex; flex-direction: column; gap: 12px; }
.assistant-demo-messages p { max-width: 90%; padding: 8px 12px; background: var(--color-code); border-radius: 12px; font-size: .9em; }
.demo-user { align-self: flex-end; }.demo-assistant { align-self: flex-start; }
@container (max-width: 440px) { .assistant-workflow-demo { grid-template-columns: 1fr; gap: 24px; }.assistant-media { flex-direction: column; }.assistant-media img { width: 100%; max-width: none; max-height: 220px; } }
</style>
