<script setup lang="ts">
defineProps<{ text: string }>()
</script>

<template>
  <section class="mt-8 border border-line rounded-panel bg-accent-surface p-5 md:p-6" aria-label="AI 摘要">
    <h2 class="mb-3 text-sm text-accent-soft font-semibold">
      AI 摘要
    </h2>
    <p class="break-words text-ink leading-8">
      {{ text }}
    </p>
  </section>
</template>
