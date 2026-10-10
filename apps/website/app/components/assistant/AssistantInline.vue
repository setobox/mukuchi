<script setup lang="ts">
import type { SafeInline } from '~/features/assistant/markdown'

defineProps<{ parts: SafeInline[] }>()
</script>

<template>
  <template v-for="(part, index) in parts" :key="index">
    <code v-if="part.type === 'code'">{{ part.text }}</code>
    <strong v-else-if="part.type === 'strong'">{{ part.text }}</strong>
    <template v-else>
      {{ part.text }}
    </template>
  </template>
</template>
