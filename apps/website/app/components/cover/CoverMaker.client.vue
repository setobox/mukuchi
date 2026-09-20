<script setup lang="ts">
import type { CoverFormat, CoverIcon, CoverImage, RasterCover } from '~/features/cover/model'
import { formatFileSize } from '#shared/admin/media'
import { readIcon, readRaster } from '~/features/cover/assets'
import { createTextMeasurer, downloadCover, exportCover } from '~/features/cover/export'
import { defaultCover, initialIcon } from '~/features/cover/model'
import { useCoverMotion } from '~/features/cover/motion'
import { renderCover, svgDataUrl } from '~/features/cover/svg'

const props = withDefaults(defineProps<{ initialTitle?: string, applyCover?: (result: RasterCover) => Promise<void> }>(), { initialTitle: '文章标题' })
const emit = defineEmits<{ busy: [value: boolean] }>()
const settings = ref(defaultCover(props.initialTitle))
const icon = shallowRef<CoverIcon>(initialIcon)
const backgroundImage = shallowRef<CoverImage>()
const format = ref<CoverFormat>('png')
const formatLabel = computed(() => ({ png: 'PNG', svg: 'SVG', webp: 'WebP' })[format.value])
const quality = ref(90)
const ratio = ref('16:9')
const error = ref('')
const status = ref('')
const busy = ref(false)
const activeTab = ref('text')
const tabs = [{ id: 'text', name: '文字' }, { id: 'icon', name: '图标' }, { id: 'background', name: '背景' }, { id: 'canvas', name: '画布' }]
const root = useTemplateRef<HTMLElement>('root')
const motion = useCoverMotion(root)
const id = useId()
let disposed = false
const measure = createTextMeasurer()
const scene = computed(() => {
  try {
    return { svg: renderCover(settings.value, icon.value, measure, backgroundImage.value), error: '' }
  }
  catch (cause) { return { svg: '', error: cause instanceof Error ? cause.message : '无法生成预览。' } }
})
const preview = computed(() => scene.value.svg ? svgDataUrl(scene.value.svg) : '')
const outputSize = computed(() => `${settings.value.width * settings.value.scale} × ${settings.value.height * settings.value.scale}`)
watch(busy, value => emit('busy', value), { flush: 'sync' })
watch([settings, icon, backgroundImage], () => {
  error.value = status.value = ''
}, { deep: true })
watch(activeTab, async () => {
  await nextTick()
  motion.play('panel')
})
watch([busy, status, error], async () => {
  await nextTick()
  motion.play('feedback')
})
function moveTab(event: KeyboardEvent, index: number) {
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : -1
  if (next < 0)
    return
  event.preventDefault()
  activeTab.value = tabs[next]!.id
  root.value?.querySelector<HTMLButtonElement>(`[data-cover-tab="${activeTab.value}"]`)?.focus()
}
function applyRatio() {
  if (ratio.value !== 'custom') {
    const [w, h] = ratio.value.split(':').map(Number)
    settings.value.height = Math.round(settings.value.width * h! / w!)
  }
}
function selectIcon(value: CoverIcon) {
  icon.value = value
  motion.play('preview')
}
async function upload(file: File, kind: 'icon' | 'background') {
  if (busy.value)
    return
  busy.value = true
  error.value = ''
  try {
    if (kind === 'icon') {
      const result = await readIcon(file)
      if (!disposed)
        icon.value = result
    }
    else {
      const result = await readRaster(file)
      if (!disposed) {
        backgroundImage.value = result
        settings.value.transparent = false
      }
    }
    if (!disposed) {
      await nextTick()
      motion.play('preview')
    }
  }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '素材读取失败。' }
  finally { busy.value = false }
}
function reset() {
  settings.value = defaultCover(props.initialTitle)
  icon.value = initialIcon
  backgroundImage.value = undefined
  ratio.value = '16:9'
  format.value = 'png'
  quality.value = 90
  activeTab.value = 'text'
  error.value = status.value = ''
  motion.play('preview')
}
async function output(apply: boolean) {
  if (busy.value || scene.value.error)
    return
  busy.value = true
  error.value = status.value = ''
  try {
    const selectedFormat = format.value
    const blob = await exportCover(scene.value.svg, selectedFormat, quality.value / 100)
    if (disposed)
      return
    if (apply && props.applyCover && selectedFormat !== 'svg') {
      await props.applyCover({ blob, format: selectedFormat })
      status.value = '封面已应用并保存到草稿。'
    }
    else {
      downloadCover(blob, selectedFormat)
      status.value = `${formatLabel.value} 图片已生成，${formatFileSize(blob.size)}。`
    }
  }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '生成失败，请重试。' }
  finally { busy.value = false }
}
onBeforeUnmount(() => {
  disposed = true
})
</script>

<template>
  <div ref="root" class="grid mx-auto max-w-[640px] min-w-0 w-full items-start gap-3 lg:grid-cols-[minmax(0,1fr)_340px] lg:max-w-[960px]">
    <section class="min-w-0 space-y-3" aria-label="封面预览">
      <div class="overflow-hidden border border-line rounded-panel bg-surface">
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
          <span class="text-xs text-heading font-medium">实时预览</span><span class="text-xs text-muted font-mono">{{ outputSize }} px</span>
        </div>
        <div class="flex items-center justify-center p-3">
          <div data-cover-motion="preview" class="w-full overflow-hidden rounded-lg" :class="settings.transparent ? 'cover-checker' : ''" :style="{ aspectRatio: `${settings.width || 1200} / ${settings.height || 675}`, maxWidth: `min(${320 * (settings.width || 1200) / (settings.height || 675)}px, ${45 * (settings.width || 1200) / (settings.height || 675)}dvh)` }">
            <img v-if="preview" :src="preview" alt="封面实时预览" class="h-full w-full object-contain">
            <div v-else class="h-full min-h-40 flex items-center justify-center p-4 text-center text-sm text-muted">
              调整参数后显示预览
            </div>
          </div>
        </div>
        <fieldset :disabled="busy" class="min-w-0 border-t border-line p-3">
          <div class="flex flex-wrap items-end gap-2">
            <BaseSelect v-model="format" label="格式" :options="[{ value: 'png', label: 'PNG' }, { value: 'svg', label: 'SVG' }, { value: 'webp', label: 'WebP' }]" class="min-w-24 flex-1" />
            <BaseSelect v-model="settings.scale" label="倍率" :options="[{ value: 1, label: '1×' }, { value: 2, label: '2×' }, { value: 3, label: '3×' }]" class="min-w-20 flex-1" />
            <div v-if="format === 'webp'" class="w-22">
              <CoverNumber v-model="quality" label="质量" :min="1" :max="100" unit="%" />
            </div>
            <BaseButton :disabled="busy || !!scene.error" @click="output(false)">
              <span class="i-lucide-save shrink-0" aria-hidden="true" />下载 {{ formatLabel }}
            </BaseButton>
            <BaseButton v-if="applyCover" variant="border" :disabled="busy || !!scene.error || format === 'svg'" @click="output(true)">
              应用为封面
            </BaseButton>
            <BaseButton variant="ghost" :disabled="busy" @click="reset">
              重置
            </BaseButton>
          </div>
        </fieldset>
      </div>
      <p v-if="scene.error" role="alert" class="border border-warn rounded-button p-3 text-sm text-warn">
        {{ scene.error }}
      </p>
      <div data-cover-motion="feedback" class="space-y-2">
        <p v-if="busy || status" role="status" class="text-sm text-accent-soft">
          {{ busy ? '正在处理，请稍候…' : status }}
        </p>
        <p v-if="error" role="alert" class="text-sm text-error">
          {{ error }}
        </p>
      </div>
      <div v-if="applyCover && preview" class="grid grid-cols-2 gap-3">
        <figure v-for="crop in [{ ratio: '16/9', name: '详情与卡片 · 16:9' }, { ratio: '3/2', name: '文章列表 · 3:2' }]" :key="crop.ratio" class="m-0 min-w-0">
          <div class="cover-checker overflow-hidden border border-line rounded-lg" :style="{ aspectRatio: crop.ratio }">
            <img :src="preview" alt="文章封面裁切预览" class="h-full w-full object-cover">
          </div>
          <figcaption class="mt-1 text-xs text-muted">
            {{ crop.name }}
          </figcaption>
        </figure>
      </div>
      <p v-if="format === 'svg'" class="text-xs text-muted">
        SVG 保留文本，字体取决于打开文件的设备。文章封面请选择 PNG 或 WebP。
      </p>
      <p class="text-xs text-muted">
        仅保存生成图片。关闭或刷新后，编辑参数不保留。
      </p>
    </section>
    <fieldset :disabled="busy" class="min-w-0 overflow-hidden border border-line rounded-panel bg-surface" aria-label="封面参数">
      <div role="tablist" aria-label="参数分类" class="grid grid-cols-4 border-b border-line p-1">
        <button v-for="(tab, index) in tabs" :id="`${id}-${tab.id}`" :key="tab.id" type="button" role="tab" :data-cover-tab="tab.id" :aria-selected="activeTab === tab.id" :aria-controls="`${id}-panel`" :tabindex="activeTab === tab.id ? 0 : -1" class="control-base control-quiet text-sm" :class="activeTab === tab.id ? 'control-selected font-medium' : 'text-muted'" @click="activeTab = tab.id" @keydown="moveTab($event, index)">
          {{ tab.name }}
        </button>
      </div>
      <div :id="`${id}-panel`" role="tabpanel" :aria-labelledby="`${id}-${activeTab}`" data-cover-motion="panel" class="min-w-0 p-3">
        <div v-if="activeTab === 'text'" class="space-y-2">
          <div class="grid grid-cols-2 gap-2">
            <label class="cover-field">左侧文字<textarea v-model="settings.left" rows="2" maxlength="200" class="cover-input resize-y py-2" /></label>
            <label class="cover-field">右侧文字<textarea v-model="settings.right" rows="2" maxlength="200" class="cover-input resize-y py-2" /></label>
          </div>
          <CoverTextControls v-model="settings.text" />
          <CoverShadowControls v-model="settings.textShadow" label="文字阴影" />
        </div>
        <div v-else-if="activeTab === 'icon'" class="space-y-3">
          <div class="flex items-center gap-3">
            <img :src="svgDataUrl(icon.svg.replaceAll('currentColor', settings.iconColor))" alt="" class="size-10 object-contain">
            <div class="min-w-0 text-xs">
              <p class="break-all text-heading">
                {{ icon.id === 'upload' ? icon.name : icon.id }}
              </p><p v-if="icon.collection" class="mt-1 text-muted">
                {{ icon.collection }} · {{ icon.license?.name }}
              </p>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <CoverNumber v-model="settings.iconSize" label="图标大小" :min="24" :max="2048" unit="px" />
            <label v-if="icon.monochrome" class="cover-field">图标颜色<input v-model="settings.iconColor" type="color" class="cover-input w-full p-1"></label>
          </div>
          <div class="border-y border-line py-1">
            <BaseSwitch v-model="settings.glass.enabled" label="图标玻璃背景" />
            <div v-if="settings.glass.enabled" class="grid grid-cols-2 gap-3 pb-3">
              <label class="cover-field">底板颜色<input v-model="settings.glass.color" type="color" class="cover-input p-1"></label>
              <CoverNumber v-model="settings.glass.opacity" label="底板不透明度" :min="0" :max="1" :step="0.05" />
              <CoverNumber v-model="settings.glass.padding" label="底板内边距" :min="0" :max="160" unit="px" />
              <CoverNumber v-model="settings.glass.radius" label="底板圆角" :min="0" :max="256" unit="px" />
              <CoverNumber v-model="settings.glass.blur" label="玻璃模糊" :min="0" :max="80" unit="px" />
            </div>
          </div>
          <CoverShadowControls v-model="settings.iconShadow" label="图标阴影" />
          <details>
            <summary class="control-quiet min-h-11 cursor-pointer content-center text-sm text-heading">
              上传图标
            </summary><CoverAssetInput label="选择图标文件" accept="image/svg+xml,image/png,image/webp" :disabled="busy" @file="upload($event, 'icon')" /><p class="mt-2 text-xs text-muted">
              SVG、PNG、WebP；静态 SVG 最多 128 KiB。
            </p>
          </details>
          <LazyCoverIconPicker :selected="icon.id" :color="settings.iconColor" :disabled="busy" @select="selectIcon" />
        </div>
        <div v-else-if="activeTab === 'background'" class="space-y-3">
          <BaseSwitch v-model="settings.transparent" label="透明背景" />
          <p v-if="settings.transparent" class="text-xs text-muted">
            透明模式隐藏画布底色、背景图片和亚克力层。
          </p>
          <label v-else class="cover-field">背景颜色<input v-model="settings.background" type="color" class="cover-input p-1"></label>
          <CoverAssetInput label="选择背景图片" accept="image/jpeg,image/png,image/webp" :disabled="busy" @file="upload($event, 'background')" />
          <div v-if="backgroundImage" class="flex items-center gap-3">
            <img :src="backgroundImage.dataUrl" alt="已上传背景" class="h-12 w-18 rounded-button object-cover"><p class="min-w-0 flex-1 break-all text-xs text-muted">
              {{ backgroundImage.name }}<br>{{ backgroundImage.width }} × {{ backgroundImage.height }}
            </p><button type="button" class="control-base text-xs text-error underline-offset-4 active:underline hover:underline" @click="backgroundImage = undefined">
              移除
            </button>
          </div>
          <p v-else class="text-xs text-muted">
            JPG、PNG、WebP，居中铺满画布。
          </p>
          <BaseSwitch v-model="settings.acrylic.enabled" label="图片亚克力" :disabled="!backgroundImage" />
          <div v-if="settings.acrylic.enabled && backgroundImage" class="grid grid-cols-2 gap-3">
            <CoverNumber v-model="settings.acrylic.blur" label="图片模糊" :min="0" :max="80" unit="px" />
            <label class="cover-field">染色颜色<input v-model="settings.acrylic.color" type="color" class="cover-input p-1"></label>
            <CoverNumber v-model="settings.acrylic.opacity" label="染色不透明度" :min="0" :max="1" :step="0.05" />
            <CoverNumber v-model="settings.acrylic.noise" label="颗粒强度" :min="0" :max="0.3" :step="0.01" />
          </div>
        </div>
        <div v-else class="space-y-3">
          <BaseSelect v-model="ratio" label="画布比例" :options="[{ value: '16:9', label: '16:9' }, { value: '3:2', label: '3:2' }, { value: '4:3', label: '4:3' }, { value: '1:1', label: '1:1' }, { value: 'custom', label: '自定义' }]" @update:model-value="applyRatio" />
          <div class="grid grid-cols-2 gap-3">
            <CoverNumber v-model="settings.width" label="宽度" :min="240" :max="4096" unit="px" @update:model-value="applyRatio" /><CoverNumber v-model="settings.height" label="高度" :min="240" :max="4096" unit="px" @update:model-value="ratio = 'custom'" />
          </div>
          <p class="text-xs text-muted">
            最终尺寸 {{ outputSize }} px，单边上限 4096px。
          </p>
        </div>
      </div>
    </fieldset>
  </div>
</template>

<style scoped>
.cover-checker {
  background-color: #696766;
  background-image: conic-gradient(#8d8a88 25%, transparent 0 50%, #8d8a88 0 75%, transparent 0);
  background-size: 20px 20px;
}
</style>
