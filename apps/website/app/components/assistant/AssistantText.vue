<script setup lang="ts">
import { safeMarkdown } from '~/features/assistant/markdown'

const props = defineProps<{ text: string }>()
const blocks = computed(() => safeMarkdown(props.text))
</script>

<template>
  <div class="assistant-text">
    <template v-for="(block, index) in blocks" :key="index">
      <pre v-if="block.type === 'code'"><code>{{ block.lines.map(line => line.map(part => part.text).join('')).join('\n') }}</code></pre>
      <p v-else :class="{ 'assistant-list-item': block.type === 'list' }">
        <template v-for="(part, partIndex) in block.lines[0]" :key="partIndex">
          <code v-if="part.type === 'code'">{{ part.text }}</code>
          <strong v-else-if="part.type === 'strong'">{{ part.text }}</strong>
          <template v-else>
            {{ part.text }}
          </template>
        </template>
      </p>
    </template>
  </div>
</template>

<style scoped>
.assistant-text { overflow-wrap: anywhere; line-height: 1.8; }
.assistant-text p + p { margin-top: .6rem; }
.assistant-text pre { overflow-x: auto; padding: .8rem; border-radius: 8px; background: var(--color-code); }
.assistant-text code { font-family: var(--font-mono); font-size: .9em; }
.assistant-list-item { padding-left: 1rem; }
.assistant-list-item::before { content: '•'; margin-left: -1rem; margin-right: .6rem; }
</style>
