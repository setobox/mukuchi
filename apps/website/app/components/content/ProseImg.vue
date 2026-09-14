<script setup lang="ts">
import { computed, inject, onMounted, ref, useTemplateRef, watch } from 'vue'
import { useRuntimeConfig } from '#app'
import { canPreviewImage, imageLinkKey, imagePreviewKey, imageSource } from '~/features/images/context'

const props = withDefaults(defineProps<{
  src?: string
  alt?: string
  width?: string | number
  height?: string | number
  caption?: string
  preview?: boolean | string
}>(), { src: '', alt: '', preview: true })
const config = useRuntimeConfig()
const previewer = inject(imagePreviewKey, undefined)
const linked = inject(imageLinkKey, false)
const image = useTemplateRef<HTMLImageElement>('image')
const failed = ref(false)
const loaded = ref(false)
const source = computed(() => imageSource(props.src, config.app.baseURL))
const interactive = computed(() => Boolean(previewer) && canPreviewImage(props.preview, linked, failed.value))

function inspectImage() {
  if (image.value?.complete) {
    loaded.value = image.value.naturalWidth > 0
    failed.value = !loaded.value
  }
}
function open() {
  if (interactive.value && loaded.value)
    previewer?.open({ src: source.value, alt: props.alt, caption: props.caption })
}
watch(source, () => {
  failed.value = false
  loaded.value = false
})
onMounted(inspectImage)
</script>

<template>
  <span class="my-6 max-w-full inline-flex flex-col align-middle">
    <component
      :is="interactive ? 'button' : 'span'"
      :type="interactive ? 'button' : undefined"
      :aria-label="interactive ? `预览图片：${alt || '正文图片'}` : undefined"
      :aria-haspopup="interactive ? 'dialog' : undefined"
      :disabled="interactive && !loaded ? true : undefined"
      class="block max-w-full rounded-xl p-0 text-left"
      :class="{ 'cursor-zoom-in': interactive && loaded }"
      @click="open"
    >
      <img
        v-if="!failed" ref="image" :src="source" :alt="alt" :width="width" :height="height"
        loading="lazy" decoding="async" class="h-auto max-w-full rounded-xl"
        @load="inspectImage" @error="failed = true"
      >
      <span v-else class="block border border-line rounded-xl bg-surface p-5 text-s text-muted">
        {{ alt ? `${alt}：` : '' }}图片加载失败
      </span>
    </component>
    <span v-if="caption" class="mt-2 block text-center text-xs text-muted">{{ caption }}</span>
  </span>
</template>
