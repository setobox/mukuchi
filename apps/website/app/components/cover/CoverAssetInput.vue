<script setup lang="ts">
import { ref, useTemplateRef } from 'vue'

const props = defineProps<{ label: string, accept: string, disabled?: boolean }>()
const emit = defineEmits<{ file: [file: File] }>()
const input = useTemplateRef<HTMLInputElement>('input')
const dragging = ref(false)
function select(files: FileList | null | undefined) {
  if (!props.disabled && files?.[0])
    emit('file', files[0])
}
function changed(event: Event) {
  const target = event.target as HTMLInputElement
  select(target.files)
  target.value = ''
}
function dropped(event: DragEvent) {
  dragging.value = false
  select(event.dataTransfer?.files)
}
function pasted(event: ClipboardEvent) {
  const image = Array.from(event.clipboardData?.files ?? []).find(file => file.type.startsWith('image/'))
  if (!props.disabled && image) {
    event.preventDefault()
    emit('file', image)
  }
}
</script>

<template>
  <div role="group" :aria-label="label" tabindex="0" class="ui-feedback min-w-0 border rounded-button border-dashed p-3 focus-within:border-accent" :class="[dragging ? 'border-accent bg-accent-surface' : 'border-line-strong', disabled ? 'pointer-events-none' : 'hover:border-accent']" @dragover.prevent="dragging = !disabled" @dragleave="dragging = false" @drop.prevent="dropped" @paste="pasted" @keydown.enter.self="input?.click()" @keydown.space.prevent.self="input?.click()">
    <input ref="input" type="file" :accept="accept" :disabled="disabled" :aria-label="label" class="hidden" @change="changed">
    <button type="button" class="control-base control-quiet w-full text-sm text-heading font-medium" :disabled="disabled" @click="input?.click()">
      {{ label }}
    </button>
    <p class="text-center text-xs text-muted">
      拖入图片，或聚焦此区域后粘贴 · 最多 5 MiB
    </p>
  </div>
</template>
