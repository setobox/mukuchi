<script setup lang="ts">
import { computed } from 'vue'
import { resolveVideo } from '#shared/video/embed'
import VideoCard from '../media/VideoCard.vue'

const props = defineProps<{ bvid?: string, src?: string, p?: string | number, start?: string | number, title?: string }>()
const video = computed(() => resolveVideo('bilibili', { id: props.bvid, src: props.src, p: props.p, start: props.start }))
</script>

<template>
  <VideoCard provider="bilibili" :video="video" :title="title">
    <slot />
  </VideoCard>
</template>
