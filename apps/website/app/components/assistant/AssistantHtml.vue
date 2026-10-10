<script setup lang="ts">
import type { PresentationBlock } from '#shared/assistant/presentation'
import { useResizeObserver } from '@vueuse/core'
import { computed, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'
import { cleanAssistantHtml } from '#shared/assistant/html'

const props = defineProps<{ block: Extract<PresentationBlock, { type: 'html' }>, theme?: 'light' | 'dark' }>()
const frame = useTemplateRef<HTMLIFrameElement>('frame')
const root = useTemplateRef<HTMLElement>('root')
const height = ref(180)
const colors = ref('')
let observer: ResizeObserver | undefined
let themeObserver: MutationObserver | undefined
const source = computed(() => {
  try {
    const clean = cleanAssistantHtml(props.block.html, props.block.css)
    return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{${colors.value}}*{box-sizing:border-box}body{margin:0;padding:16px;background:transparent;color:var(--color-text);font:14px/1.7 system-ui,sans-serif;overflow-wrap:anywhere}pre{white-space:pre-wrap}table{max-width:100%}h2,h3,h4,p{margin-top:0}${clean.css}</style></head><body>${clean.html}</body></html>`
  }
  catch { return '' }
})
function updateColors() {
  if (!root.value)
    return
  const style = getComputedStyle(root.value)
  colors.value = ['text', 'heading', 'muted', 'border', 'surface', 'canvas', 'accent', 'accent-surface', 'success', 'warn', 'code'].map(name => `--color-${name}:${style.getPropertyValue(`--color-${name}`).trim().replace(/[<>]/g, '')}`).join(';')
}
function loaded() {
  observer?.disconnect()
  const body = frame.value?.contentDocument?.body
  if (!body)
    return
  const measure = () => {
    height.value = Math.max(80, Math.min(720, Math.ceil(body.getBoundingClientRect().height)))
  }
  measure()
  observer = new ResizeObserver(measure)
  observer.observe(body)
}
watch(root, (element) => {
  if (!element)
    return
  updateColors()
  themeObserver = new MutationObserver(updateColors)
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] })
}, { flush: 'post' })
watch(() => props.theme, updateColors, { flush: 'post' })
useResizeObserver(root, updateColors)
onBeforeUnmount(() => {
  observer?.disconnect()
  themeObserver?.disconnect()
})
</script>

<template>
  <div ref="root" class="assistant-html">
    <iframe v-if="source" ref="frame" :title="block.title" sandbox="allow-same-origin" referrerpolicy="no-referrer" :srcdoc="source" :style="{ height: `${height}px` }" @load="loaded" />
    <p v-else class="p-4 text-sm text-muted">
      {{ block.summary || '此结构暂时无法展示。' }}
    </p>
  </div>
</template>

<style scoped>
.assistant-html { min-width: 0; border: 1px solid var(--color-border); border-radius: 12px; overflow: hidden; }
.assistant-html iframe { display: block; width: 100%; border: 0; background: transparent; }
</style>
