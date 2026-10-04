<script setup lang="ts">
import BaseTooltip from './BaseTooltip.vue'

withDefaults(defineProps<{ label: string, text: string, active?: boolean }>(), { active: true })
</script>

<template>
  <BaseTooltip :text="text" :disabled="!active" toggle-on-click :delay-duration="0" side="bottom" align="end">
    <button type="button" :aria-label="label" class="icon-button" :disabled="!active">
      <span class="i-lucide-info size-4" aria-hidden="true" />
    </button>
  </BaseTooltip>
</template>
