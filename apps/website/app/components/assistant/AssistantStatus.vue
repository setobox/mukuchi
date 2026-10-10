<script setup lang="ts">
import { computed } from 'vue'
import { durationLabel } from '#shared/assistant/stream'
import { useAssistantMotion } from '~/features/assistant/motion'

const props = defineProps<{ active?: boolean, label?: string, durationMs?: number, failed?: boolean }>()
const motion = useAssistantMotion()
const text = computed(() => props.active ? props.label || '正在连接…' : props.label || (props.durationMs !== undefined ? `已完成 · 用时 ${durationLabel(props.durationMs)}` : ''))
</script>

<template>
  <div v-if="text" class="assistant-progress" :class="{ 'is-active': active, 'is-failed': failed }" role="status" aria-live="polite" aria-atomic="true">
    <span class="assistant-progress-icon" :class="active ? 'i-lucide-loader-circle' : failed ? 'i-lucide-circle-alert' : 'i-lucide-check'" aria-hidden="true" />
    <Transition :css="false" @enter="motion.enter">
      <span :key="text">{{ text }}</span>
    </Transition>
  </div>
</template>

<style scoped>
.assistant-progress { display: flex; align-items: center; gap: .5rem; min-height: 24px; color: var(--color-muted); font-size: 12px; line-height: 1.6; }
.assistant-progress-icon { flex-shrink: 0; width: 14px; height: 14px; }
.is-active .assistant-progress-icon { animation: assistant-spin 1.4s linear infinite; color: var(--color-accent); }
.is-failed { color: var(--color-warn); }
@keyframes assistant-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .is-active .assistant-progress-icon { animation: none; } }
</style>
