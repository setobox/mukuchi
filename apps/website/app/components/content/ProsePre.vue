<script setup lang="ts">
import { computed, h, useId } from 'vue'
import CodeCopy from '../code/CodeCopy.vue'

const props = withDefaults(defineProps<{
  code?: string
  language?: string | null
  filename?: string | null
  highlights?: number[]
  meta?: string | null
  class?: string | null
  grouped?: boolean
}>(), { code: '', highlights: () => [], grouped: false })
const id = useId()
const label = computed(() => props.filename || props.language || '代码')
const highlightCss = computed(() => props.highlights
  .filter(line => Number.isInteger(line) && line > 0)
  .map(line => `[data-code-id="${id}"] .line[line="${line}"]`)
  .join(','))
// Native style content must bypass HTML escaping. Inputs are generated IDs and integers.
function HighlightStyles() {
  return highlightCss.value
    ? h('style', { innerHTML: `${highlightCss.value}{background:var(--color-accent-surface);box-shadow:inset 3px 0 var(--color-accent-text)}` })
    : null
}
</script>

<template>
  <div :class="grouped ? 'min-w-0' : 'field-group my-6 min-w-0 overflow-hidden border border-line rounded-xl bg-code'">
    <div v-if="!grouped" class="min-w-0 flex items-center justify-between gap-2 border-b border-line px-3 py-1">
      <span class="min-w-0 break-all text-xs text-muted">{{ label }}</span>
      <CodeCopy :code="code" />
    </div>
    <pre
      :data-code-id="id" :class="props.class"
      class="m-0 overflow-x-auto py-5 text-xs leading-7 font-mono [&_code]:[font:inherit] [&_.line]:block [&_code]:block [&_.line]:min-h-[1lh] [&_code]:min-w-full [&_code]:w-max bg-code! [&_.line]:px-5 [&_code:not(:has(.line))]:px-5 [&_code]:text-inherit"
      tabindex="0" :aria-label="grouped ? undefined : label"
    ><slot /></pre>
    <HighlightStyles />
  </div>
</template>
