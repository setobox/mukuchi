<script setup lang="ts">
defineProps<{ text: string }>()
const assistant = useAssistant()
const enabled = computed(() => assistant?.enabled.value ?? false)
const question = ref('')
async function ask(text = question.value) {
  if (!text.trim() || !assistant)
    return
  await assistant.open(text, true)
  question.value = ''
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
        <input v-model="question" class="min-w-0 flex-1 bg-transparent px-2" maxlength="500" placeholder="针对这篇文章提问…" aria-label="针对这篇文章提问" @keydown.enter="($event.isComposing || $event.keyCode === 229) && $event.preventDefault()">
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
