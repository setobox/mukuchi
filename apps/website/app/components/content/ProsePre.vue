<script setup lang="ts">
import { computed, h, useId } from 'vue'
import { codeThemeStyle } from '#shared/content/code'
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
const lineNumbers = computed(() => props.meta?.split(/\s+/).includes('line-numbers') ?? false)
const plainLines = computed(() => lineNumbers.value && (!props.language || ['text', 'txt', 'plaintext'].includes(props.language.toLowerCase()))
  ? props.code.replace(/\n$/, '').split('\n')
  : null)
const highlightCss = computed(() => props.highlights
  .filter(line => Number.isInteger(line) && line > 0)
  .map(line => `[data-code-id="${id}"] .line[line="${line}"]`)
  .join(','))
// Native style content must bypass HTML escaping. Inputs are generated IDs and integers.
function HighlightStyles() {
  return highlightCss.value
    ? h('style', { innerHTML: `${highlightCss.value}{background:var(--code-highlight-bg);box-shadow:inset 3px 0 var(--code-highlight-border)}` })
    : null
}
</script>

<template>
  <div class="code-block" :style="codeThemeStyle" :class="grouped ? 'min-w-0' : 'field-group my-6 min-w-0 overflow-hidden border border-line rounded-xl'">
    <div v-if="!grouped" class="min-w-0 flex items-center justify-between gap-2 border-b border-line px-3 py-1">
      <span class="min-w-0 break-all text-xs opacity-75">{{ label }}</span>
      <CodeCopy :code="code" />
    </div>
    <pre
      :data-code-id="id" :class="[props.class, { 'code-line-numbers': lineNumbers }]"
      class="code-pre m-0 overflow-x-auto py-5 text-xs leading-6 font-mono [&_code]:[font:inherit] [&_code]:block [&_code]:min-w-full [&_code]:w-max [&_code:not(:has(.line))]:px-5 [&_code]:text-inherit"
      tabindex="0" :aria-label="grouped ? undefined : label"
    ><code v-if="plainLines"><span v-for="(line, index) in plainLines" :key="index" class="line" :line="index + 1">{{ line }}{{ '\n' }}</span></code><slot v-else /></pre>
    <HighlightStyles />
  </div>
</template>
