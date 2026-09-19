<script setup lang="ts">
import type { PublicAudio } from '#shared/audio/model'
import { useMediaControls } from '@vueuse/core'
import { computed, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'
import BaseButton from '../base/BaseButton.vue'
import BaseSelect from '../base/BaseSelect.vue'
import BaseSlider from '../base/BaseSlider.vue'

const props = defineProps<{ items: PublicAudio[], preview?: boolean }>()
const selected = ref<PublicAudio['kind']>('narration')
const current = computed(() => props.items.find(item => item.kind === selected.value) ?? props.items[0])
const audio = useTemplateRef<HTMLAudioElement>('audio')
const error = ref('')
const { playing, currentTime, duration, waiting, rate, onSourceError, onPlaybackError } = useMediaControls(audio, { src: () => current.value?.url ?? '' })
const speeds = [0.75, 1, 1.25, 1.5, 2].map(value => ({ value, label: `${value}×` }))
const durationLabel = (value: number) => Number.isFinite(value) && value > 0 ? `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}` : '0:00'
const validDuration = computed(() => Number.isFinite(duration.value) && duration.value > 0 ? duration.value : 0)
const position = computed({ get: () => Math.floor(currentTime.value), set: value => currentTime.value = value })
function stop() {
  audio.value?.pause()
  playing.value = false
  currentTime.value = 0
}
watch(() => current.value?.url, () => {
  stop()
  error.value = ''
}, { flush: 'sync' })
onSourceError(() => {
  error.value = '音频暂时无法加载，请稍后重试。'
})
onPlaybackError(() => {
  error.value = '播放未能开始，请再次点击播放。'
})
async function toggle() {
  if (!audio.value)
    return
  error.value = ''
  if (playing.value) {
    audio.value.pause()
    return
  }
  try {
    await audio.value.play()
  }
  catch {
    error.value = '播放未能开始，请再次点击播放。'
  }
}
onBeforeUnmount(() => {
  stop()
  audio.value?.removeAttribute('src')
  audio.value?.load()
})
</script>

<template>
  <section v-if="current" class="border border-line rounded-panel bg-surface p-5 md:p-6" :aria-label="preview ? '后台音频试听' : '听这篇文章'">
    <div class="mb-4 flex flex-wrap items-center gap-3">
      <h2 class="mr-auto text-sm text-heading font-semibold">
        {{ preview ? '音频试听' : '听这篇文章' }}
      </h2>
      <span class="text-xs text-muted">AI 生成{{ current.kind === 'podcast' ? ' · 双人对话解读' : ' · 全文朗读' }}</span>
    </div>
    <div v-if="items.length > 1" class="mb-4 flex flex-wrap gap-2" role="group" aria-label="收听模式">
      <button v-for="item in items" :key="item.id" type="button" class="control-base control-quiet px-3 text-sm" :class="current.kind === item.kind ? 'control-selected' : 'text-muted'" :aria-pressed="current.kind === item.kind" @click="selected = item.kind">
        {{ item.kind === 'narration' ? '全文朗读' : '双人播客' }}
      </button>
    </div>
    <audio ref="audio" preload="metadata" />
    <div class="flex flex-wrap items-center gap-4">
      <BaseButton type="button" :aria-label="playing ? '暂停音频' : '播放音频'" @click="toggle">
        <span aria-hidden="true" :class="playing ? 'i-lucide-pause' : 'i-lucide-play'" />{{ playing ? '暂停' : '播放' }}
      </BaseButton>
      <span class="text-xs text-muted tabular-nums">{{ durationLabel(currentTime) }} / {{ durationLabel(duration) }}</span>
      <BaseSelect v-model="rate" :options="speeds" aria-label="播放速度" class="ml-auto w-24" />
    </div>
    <div class="mt-4">
      <BaseSlider v-model="position" label="播放进度" :min="0" :max="Math.floor(validDuration) || 1" :step="1" unit=" 秒" :disabled="!validDuration" />
    </div>
    <p v-if="waiting" role="status" class="mt-3 text-xs text-muted">
      正在缓冲音频…
    </p>
    <p v-if="error" role="alert" class="mt-3 text-xs text-error">
      {{ error }}
    </p>
  </section>
</template>
