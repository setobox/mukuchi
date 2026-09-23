<script setup lang="ts">
import { computed } from 'vue'
import { resolveVideo } from '#shared/video/embed'
import VideoCard from '../media/VideoCard.vue'

const props = defineProps<{ id?: string, src?: string, start?: string | number, title?: string }>()
const video = computed(() => resolveVideo('youtube', props))
</script>

<template>
  <VideoCard provider="youtube" :video="video" :title="title">
    <slot />
  </VideoCard>
</template>
