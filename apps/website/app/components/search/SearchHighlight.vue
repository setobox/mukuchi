<script setup lang="ts">
import { computed } from 'vue'
import { highlightParts } from '~/features/search/model'

const props = defineProps<{ text: string, query: string }>()
const parts = computed(() => highlightParts(props.text, props.query))
</script>

<template>
  <template v-for="(part, index) in parts" :key="index">
    <mark v-if="part.marked" class="bg-transparent text-accent-soft font-bold">{{ part.text }}</mark>
    <template v-else>
      {{ part.text }}
    </template>
  </template>
</template>
