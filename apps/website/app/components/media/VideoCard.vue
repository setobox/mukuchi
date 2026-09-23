<script setup lang="ts">
import type { VideoEmbed, VideoProvider } from '#shared/video/embed'
import { computed } from 'vue'
import AppIcon from '../AppIcon.vue'

defineOptions({ inheritAttrs: false })
const props = defineProps<{ provider: VideoProvider, video: VideoEmbed | null, title?: string }>()
const platform = computed(() => props.provider === 'bilibili' ? 'Bilibili' : 'YouTube')
const label = computed(() => props.title?.trim() || `${platform.value} 视频`)
</script>

<template>
  <figure v-bind="$attrs" :data-prose-card="provider" class="mx-0 my-6 min-w-0 overflow-hidden border border-line rounded-panel bg-surface">
    <figcaption class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
      <span class="inline-flex shrink-0 items-center gap-1.5 text-xs text-accent-soft font-semibold">
        <AppIcon :name="provider === 'bilibili' ? 'tv' : 'youtube'" />
        {{ platform }}
      </span>
      <span class="min-w-0 break-words text-s text-heading">{{ label }}</span>
    </figcaption>
    <div v-if="video" class="relative aspect-video min-h-50 w-full bg-canvas">
      <iframe
        :key="video.src"
        :src="video.src"
        :title="`${label} · ${platform} 播放器`"
        width="800" height="450"
        loading="lazy"
        referrerpolicy="strict-origin-when-cross-origin"
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen; web-share"
        allowfullscreen
        class="absolute inset-0 block h-full w-full border-0"
      />
    </div>
    <div v-else class="border-y border-line px-4 py-6 text-s text-error" role="status">
      无法显示视频，请检查{{ provider === 'bilibili' ? ' BV 号' : '视频 ID' }}、链接或播放参数。
    </div>
    <div v-if="video" class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-line px-4 py-2 text-xs">
      <span class="text-muted">无法播放时，可前往平台观看</span>
      <a :href="video.href" target="_blank" rel="noopener noreferrer" class="ui-link min-h-11 inline-flex items-center gap-1.5">
        在 {{ platform }} 观看<AppIcon name="arrow" />
        <span class="sr-only">（在新标签页打开）</span>
      </a>
    </div>
  </figure>
  <slot />
</template>
