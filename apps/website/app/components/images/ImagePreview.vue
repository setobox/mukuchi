<script setup lang="ts">
import type { PreviewImage } from '~/features/images/context'
import { useImageGestures } from '~/features/images/useImageGestures'

const props = defineProps<{ image: PreviewImage | null }>()
const emit = defineEmits<{ close: [] }>()
const open = computed({ get: () => Boolean(props.image), set: (value) => {
  if (!value)
    emit('close')
} })
// Retain the current image until the exit animation ends.
const displayed = shallowRef(props.image)
const stage = useTemplateRef<HTMLElement>('stage')
const natural = ref({ width: 0, height: 0 })
const failed = ref(false)
const enabled = computed(() => open.value && natural.value.width > 0 && !failed.value)
const { transform, fitted, dragging, zoom, reset, keydown } = useImageGestures(stage, natural, enabled)
const imageStyle = computed(() => ({
  width: `${fitted.value.width}px`,
  height: `${fitted.value.height}px`,
  transform: `translate(-50%, -50%) translate(${transform.value.x}px, ${transform.value.y}px) scale(${transform.value.scale})`,
}))
watch(() => props.image, (value) => {
  if (value) {
    displayed.value = value
    natural.value = { width: 0, height: 0 }
    failed.value = false
  }
}, { immediate: true })
function loaded(event: Event) {
  const image = event.target as HTMLImageElement
  natural.value = { width: image.naturalWidth, height: image.naturalHeight }
}
</script>

<template>
  <AcrylicDialog v-model="open" title="图片预览" placement="image" @keydown="keydown" @closed="displayed = null">
    <template #actions>
      <button class="icon-button" type="button" aria-label="放大图片" :disabled="!enabled || transform.scale >= 4" @click="zoom(transform.scale + 0.25)">
        <AppIcon name="zoomIn" />
      </button>
      <button class="icon-button" type="button" aria-label="缩小图片" :disabled="!enabled || transform.scale <= 1" @click="zoom(transform.scale - 0.25)">
        <AppIcon name="zoomOut" />
      </button>
      <button class="icon-button" type="button" aria-label="复位图片" :disabled="!enabled" @click="reset">
        <AppIcon name="reset" />
      </button>
    </template>
    <div
      ref="stage" class="ui-feedback relative h-full min-h-0 touch-none select-none overflow-hidden border border-transparent rounded-xl bg-canvas focus-visible:border-accent"
      :class="dragging ? 'cursor-grabbing' : enabled ? 'cursor-grab' : ''"
      tabindex="0" role="region" aria-label="图片展示区域，可用加减号缩放、方向键平移、0 复位" @dragstart.prevent
    >
      <img
        v-if="displayed && !failed" :key="displayed.src" :src="displayed.src" :alt="displayed.alt"
        :style="imageStyle" class="pointer-events-none absolute left-1/2 top-1/2 max-w-none origin-center"
        :class="{ 'opacity-0': !enabled }" draggable="false" @load="loaded" @error="failed = true"
      >
      <div v-if="failed || !natural.width" class="absolute inset-0 flex items-center justify-center p-5 text-center text-s text-muted" role="status">
        {{ failed ? `${displayed?.alt ? `${displayed.alt}：` : ''}图片加载失败` : '图片加载中' }}
      </div>
    </div>
    <template #footer>
      <span class="min-w-0 break-words text-xs text-muted">{{ displayed?.caption || displayed?.alt }}</span>
      <output class="shrink-0 text-xs text-muted" aria-label="图片缩放比例">{{ Math.round(transform.scale * 100) }}%</output>
    </template>
  </AcrylicDialog>
</template>
