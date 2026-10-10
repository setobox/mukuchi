<script setup lang="ts">
import { computed } from 'vue'
import { safeMarkdown } from '~/features/assistant/markdown'
import AssistantInline from './AssistantInline.vue'

const props = defineProps<{ text: string }>()
const blocks = computed(() => safeMarkdown(props.text))
</script>

<template>
  <div class="assistant-text">
    <template v-for="(block, index) in blocks" :key="index">
      <pre v-if="block.type === 'code'"><code>{{ block.lines.map(line => line.map(part => part.text).join('')).join('\n') }}</code></pre>
      <component :is="`h${block.level}`" v-else-if="block.type === 'heading'">
        <AssistantInline :parts="block.lines[0]!" />
      </component>
      <component :is="block.ordered ? 'ol' : 'ul'" v-else-if="block.type === 'list'">
        <li v-for="(line, lineIndex) in block.lines" :key="lineIndex">
          <AssistantInline :parts="line" />
        </li>
      </component>
      <blockquote v-else-if="block.type === 'quote'">
        <AssistantInline :parts="block.lines[0]!" />
      </blockquote>
      <div v-else-if="block.type === 'table'" class="assistant-table" role="region" aria-label="数据表格" tabindex="0">
        <table>
          <thead>
            <tr>
              <th v-for="(cell, cellIndex) in block.header" :key="cellIndex" scope="col">
                <AssistantInline :parts="cell" />
              </th>
            </tr>
          </thead><tbody>
            <tr v-for="(row, rowIndex) in block.rows" :key="rowIndex">
              <td v-for="(cell, cellIndex) in row" :key="cellIndex">
                <AssistantInline :parts="cell" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else>
        <AssistantInline :parts="block.lines[0]!" />
      </p>
    </template>
  </div>
</template>

<style scoped>
.assistant-text { overflow-wrap: anywhere; line-height: 1.8; }
.assistant-text > * + * { margin-top: .65rem; }
.assistant-text :is(h2,h3,h4,h5,h6) { font-size: 1.12em; font-weight: 650; line-height: 1.5; margin-top: 1.25rem; }
.assistant-text :is(h2,h3,h4,h5,h6):first-child { margin-top: 0; }
.assistant-text pre { overflow-x: auto; padding: .8rem; border-radius: 8px; background: var(--color-code); }
.assistant-text :deep(code) { font-family: var(--font-mono); font-size: .9em; background: var(--color-code); border-radius: 4px; padding: .1em .25em; }
.assistant-text ul { list-style: disc; padding-left: 1.35rem; }
.assistant-text ol { list-style: decimal; padding-left: 1.35rem; }
.assistant-text li + li { margin-top: .3rem; }
.assistant-text blockquote { border-left: 3px solid var(--color-accent); padding-left: 1rem; color: var(--color-muted); }
.assistant-table { overflow-x: auto; }
.assistant-table table { width: 100%; border-collapse: collapse; font-size: .9em; }
.assistant-table :is(th,td) { text-align: left; padding: .55rem .75rem; border: 1px solid var(--color-border); min-width: 6rem; }
</style>
