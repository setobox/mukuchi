<script setup lang="ts">
import { pasteSingleLine } from '~/features/assistant/input'

defineProps<{ text: string }>()
const assistant = useAssistant()
const enabled = computed(() => assistant?.enabled.value ?? false)
const question = computed({ get: () => assistant?.draft.value ?? '', set: (value) => {
  if (assistant)
    assistant.draft.value = value
} })
const input = useTemplateRef<HTMLInputElement>('input')
function keydown(event: KeyboardEvent) {
  if (event.key !== 'Enter')
    return
  event.preventDefault()
  if (!event.shiftKey && !event.isComposing && event.keyCode !== 229)
    void ask()
}
function paste(event: ClipboardEvent) {
  if (input.value)
    pasteSingleLine(event, input.value, value => question.value = value)
}
async function ask(text = question.value) {
  if (!text.trim() || !assistant)
    return
  await assistant.open(text, true)
}
</script>

<template>
  <section v-if="text.trim()" class="mt-8 border border-line rounded-panel bg-accent-surface p-5 md:p-6" aria-label="文章摘要">
    <h2 class="mb-3 text-sm text-accent-soft font-semibold">
      文章摘要
    </h2>
    <p class="break-words text-ink leading-8">
      {{ text }}
    </p>
    <form v-if="enabled" class="mt-4" @submit.prevent="ask()">
      <div class="flex gap-2 border border-line-strong rounded-panel bg-acrylic p-2 backdrop-blur-md">
        <input ref="input" v-model="question" class="min-w-0 flex-1 bg-transparent px-2" placeholder="问点什么？" aria-label="针对这篇文章提问" @keydown="keydown" @paste="paste">
        <button class="control-base control-quiet h-10 w-10 shrink-0" type="submit" title="向助手提问" aria-label="向助手提问" :disabled="!question.trim()">
          <span class="i-lucide-arrow-up" aria-hidden="true" />
        </button>
      </div>
      <div class="mt-2 flex gap-3 text-xs text-muted">
        <button type="button" class="hover:text-accent-soft" @click="ask('请概括当前这篇文章')">
          概括文章
        </button>
        <button type="button" class="hover:text-accent-soft" @click="ask('请解释当前这篇文章的重点')">
          解释重点
        </button>
      </div>
    </form>
  </section>
</template>
