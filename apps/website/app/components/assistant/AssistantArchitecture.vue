<script setup lang="ts">
import type { PresentationBlock } from '#shared/assistant/presentation'
import { useResizeObserver } from '@vueuse/core'
import { computed, nextTick, ref, useId, useTemplateRef, watch } from 'vue'
import { presentationIcons } from '#shared/assistant/presentation'

const props = defineProps<{ block: Extract<PresentationBlock, { type: 'architecture' }> }>()
const root = useTemplateRef<HTMLElement>('root')
const arrowId = `assistant-arrow-${useId()}`
const paths = ref<{ d: string, label: string, x: number, y: number }[]>([])
const levels = computed(() => {
  const remaining = new Set(props.block.nodes.map(node => node.id))
  const result: (typeof props.block.nodes)[] = []
  while (remaining.size) {
    const ready = props.block.nodes.filter(node => remaining.has(node.id) && !props.block.edges.some(edge => edge.to === node.id && remaining.has(edge.from)))
    if (!ready.length) {
      result.push(props.block.nodes.filter(node => remaining.has(node.id)))
      break
    }
    result.push(ready)
    for (const node of ready) remaining.delete(node.id)
  }
  return result
})
async function measure() {
  await nextTick()
  const element = root.value
  if (!element)
    return
  const rect = element.getBoundingClientRect()
  const nodes = new Map([...element.querySelectorAll<HTMLElement>('[data-node]')].map(node => [node.dataset.node!, node.getBoundingClientRect()]))
  paths.value = props.block.edges.flatMap((edge) => {
    const from = nodes.get(edge.from)
    const to = nodes.get(edge.to)
    if (!from || !to)
      return []
    const x1 = from.x + from.width / 2 - rect.x
    const y1 = from.bottom - rect.y + 3
    const x2 = to.x + to.width / 2 - rect.x
    const y2 = to.top - rect.y - 6
    const middle = (y1 + y2) / 2
    return [{ d: `M${x1},${y1} C${x1},${middle} ${x2},${middle} ${x2},${y2}`, label: edge.label, x: (x1 + x2) / 2, y: middle - 5 }]
  })
}
useResizeObserver(root, measure)
watch(() => props.block, measure, { flush: 'post', deep: true })
</script>

<template>
  <div ref="root" class="assistant-architecture" :aria-label="block.title">
    <svg class="assistant-edges" aria-hidden="true">
      <defs><marker :id="arrowId" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto"><path d="M0,0 L6,3.5 L0,7" fill="none" stroke="currentColor" /></marker></defs>
      <g v-for="(path, index) in paths" :key="index"><path :d="path.d" fill="none" stroke="currentColor" :marker-end="`url(#${arrowId})`" /><text v-if="path.label" :x="path.x" :y="path.y" text-anchor="middle">{{ path.label }}</text></g>
    </svg>
    <div v-for="(level, index) in levels" :key="index" class="assistant-architecture-level">
      <div v-for="node in level" :key="node.id" :data-node="node.id" class="assistant-architecture-node">
        <span :class="presentationIcons[node.icon]" class="text-lg text-accent-soft" aria-hidden="true" /><strong>{{ node.label }}</strong><span v-if="node.description">{{ node.description }}</span>
      </div>
    </div>
    <ul class="sr-only">
      <li v-for="(edge, index) in block.edges" :key="index">
        {{ edge.from }} → {{ edge.to }} {{ edge.label }}
      </li>
    </ul>
  </div>
</template>

<style scoped>
.assistant-architecture { position: relative; display: flex; flex-direction: column; gap: 64px; padding: 4px 0; }
.assistant-edges { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; color: var(--color-muted); pointer-events: none; }
.assistant-edges text { fill: var(--color-muted); font-size: 10px; stroke: var(--color-surface); stroke-width: 4px; paint-order: stroke; }
.assistant-architecture-level { display: flex; justify-content: center; gap: 12px; }
.assistant-architecture-node { position: relative; z-index: 1; min-width: 0; flex: 1; max-width: 25rem; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 16px 10px; border: 1px solid var(--color-border); border-radius: 10px; background: var(--color-surface); text-align: center; overflow-wrap: anywhere; }
.assistant-architecture-node strong { font-size: .95em; }
.assistant-architecture-node > span:last-child:not(:first-child) { font-size: .85em; color: var(--color-muted); }
</style>
