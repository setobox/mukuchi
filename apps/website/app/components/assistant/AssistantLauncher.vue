<script setup lang="ts">
import { pasteSingleLine } from '~/features/assistant/input'

const assistant = useAssistant()!
const route = useRoute()
const input = useTemplateRef<HTMLInputElement>('input')
const visible = computed(() => assistant.enabled.value && assistant.mode.value === 'hidden' && !route.path.startsWith('/admin') && route.path !== '/assistant/showcase')
async function submit() {
  if (assistant.draft.value.trim())
    await assistant.open(assistant.draft.value, true, 'fullscreen')
}
function keydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    if (!event.shiftKey && !event.isComposing && event.keyCode !== 229)
      void submit()
  }
}
function paste(event: ClipboardEvent) {
  if (input.value)
    pasteSingleLine(event, input.value, value => assistant.draft.value = value)
}
</script>

<template>
  <form v-if="visible" class="assistant-launcher" aria-label="快速向助手提问" @submit.prevent="submit">
    <input ref="input" v-model="assistant.draft.value" type="text" placeholder="问点什么？" aria-label="快速提问" autocomplete="off" @keydown="keydown" @paste="paste">
    <button class="assistant-launcher-shortcut" type="button" aria-label="打开完整对话框" @click="assistant.open(undefined, false, 'fullscreen')">
      <kbd>Ctrl</kbd><kbd>I</kbd>
    </button>
    <button class="assistant-launcher-send" type="submit" aria-label="提交问题" :disabled="!assistant.draft.value.trim() || assistant.busy.value">
      <span class="i-lucide-arrow-up" aria-hidden="true" />
    </button>
  </form>
</template>

<style scoped>
.assistant-launcher { position: fixed; z-index: var(--z-actions); left: 50%; bottom: max(24px, env(safe-area-inset-bottom)); display: flex; align-items: center; gap: 6px; width: 320px; padding: 7px 8px 7px 12px; border: 1px solid var(--color-border-strong); border-radius: var(--radius-button); background: color-mix(in srgb, var(--color-surface) 80%, transparent); backdrop-filter: blur(24px) saturate(1.3); box-shadow: var(--shadow-float); transform: translateX(-50%); transition: transform .2s, border-color .2s; }
.assistant-launcher:hover, .assistant-launcher:focus-within { transform: translateX(-50%) scale(1.04); border-color: var(--color-accent); }
.assistant-launcher input { flex: 1; width: 0; min-width: 0; background: transparent; font-size: 12px; outline: none; }
.assistant-launcher-shortcut { display: flex; gap: 3px; font-size: 10px; color: var(--color-muted); }
.assistant-launcher-shortcut kbd { border: 1px solid var(--color-border-strong); border-radius: 3px; padding: 0 3px; }
.assistant-launcher-send { display: flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 6px; background: var(--color-accent); color: var(--color-on-accent); }
.assistant-launcher-send:disabled { opacity: .45; }
@media (max-width: 767px) { .assistant-launcher { display: none; } }
@media (prefers-reduced-motion: reduce) { .assistant-launcher { transition: none; } }
</style>
