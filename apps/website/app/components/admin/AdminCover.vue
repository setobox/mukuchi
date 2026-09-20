<script setup lang="ts">
import type { Asset } from '#shared/admin/model'
import { formatFileSize, imageHeaderInfo, validateImageFile, validImageAddress } from '#shared/admin/media'

const props = defineProps<{
  cover: string
  assets: Asset[]
  disabled: boolean
  progress: number
  uploadFile: (file: File) => Promise<void>
  applyAddress: (address: string | undefined) => Promise<void>
}>()
const emit = defineEmits<{ make: [] }>()
const { endpoint } = useAdminSession()
const input = useTemplateRef<HTMLInputElement>('input')
const address = ref(props.cover)
const file = ref<File | null>(null)
const working = ref(false)
const inspecting = ref(false)
const error = ref('')
const broken = ref(false)
const remoteInfo = ref<{ mime: string, size: number | null }>({ mime: '', size: null })
const asset = computed(() => props.assets.find(asset => asset.path === props.cover))
const preview = computed(() => asset.value ? endpoint(`/api/admin/assets/${asset.value.id}`) : props.cover)
const info = computed(() => asset.value ?? remoteInfo.value)
watch(() => props.cover, (value) => {
  address.value = value
})
watch(preview, async (value, _old, cleanup) => {
  broken.value = false
  remoteInfo.value = { mime: '', size: null }
  inspecting.value = false
  if (!import.meta.client || !value || asset.value || !validImageAddress(value))
    return
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 6000)
  cleanup(() => {
    controller.abort()
    clearTimeout(timeout)
  })
  inspecting.value = true
  try {
    const response = await fetch(value, { method: 'HEAD', credentials: 'omit', signal: controller.signal })
    if (response.ok && value === preview.value && !controller.signal.aborted)
      remoteInfo.value = imageHeaderInfo(response.headers)
  }
  catch { /* External hosts may not expose metadata through CORS. */ }
  finally {
    clearTimeout(timeout)
    if (value === preview.value)
      inspecting.value = false
  }
}, { immediate: true })
async function selectFile(event: Event) {
  const target = event.target as HTMLInputElement
  const selected = target.files?.[0]
  target.value = ''
  if (!selected || working.value || props.disabled)
    return
  file.value = selected
  error.value = ''
  try {
    validateImageFile(selected)
    working.value = true
    await props.uploadFile(selected)
  }
  catch (cause) { error.value = cause instanceof Error ? cause.message : adminError(cause) }
  finally { working.value = false }
}
async function apply(value: string | undefined) {
  if (working.value || props.disabled)
    return
  file.value = null
  error.value = ''
  if (value && !validImageAddress(value)) {
    error.value = '请输入 HTTP(S) 地址或以 / 开头的站内图片路径。'
    return
  }
  working.value = true
  try {
    await props.applyAddress(value)
  }
  catch (cause) { error.value = cause instanceof Error ? cause.message : adminError(cause) }
  finally { working.value = false }
}
</script>

<template>
  <section class="border border-line rounded-panel p-5" aria-label="文章封面">
    <h2 class="mb-4 text-heading font-semibold">
      文章封面
    </h2>
    <div v-if="preview" class="mb-4">
      <img v-show="!broken" :src="preview" alt="当前文章封面" class="aspect-video w-full rounded-button bg-surface object-cover" @error="broken = true">
      <p v-if="broken" role="status" class="border border-line rounded-button bg-surface p-4 text-xs text-warn">
        图片暂时无法加载，请检查地址或访问权限。
      </p>
      <p class="mt-2 text-xs text-muted" role="status">
        {{ inspecting ? '正在读取大小…' : formatFileSize(info.size) }}{{ info.mime ? ` · ${info.mime.replace('image/', '').toUpperCase()}` : '' }}
      </p>
      <p v-if="!inspecting && info.size === null" class="mt-1 text-xs text-muted">
        外链可能不提供大小信息，不影响保存地址。
      </p>
    </div>
    <div class="grid gap-3">
      <BaseButton variant="border" :disabled="disabled || working" @click="emit('make')">
        <span class="i-lucide-palette mr-2" aria-hidden="true" />制作封面
      </BaseButton>
      <BaseButton variant="border" :loading="working && !!file" :disabled="disabled || working" @click="input?.click()">
        <span class="i-lucide-upload mr-2" aria-hidden="true" />上传图片
      </BaseButton>
      <input ref="input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" aria-label="上传封面图片" class="hidden" @change="selectFile">
    </div>
    <p class="mt-2 text-xs text-muted">
      PNG、JPEG、WebP、GIF；最多 5 MiB。
    </p>
    <p v-if="file" class="mt-2 break-all text-xs text-muted">
      {{ file.name }} · {{ formatFileSize(file.size) }} · {{ file.type.replace('image/', '').toUpperCase() }}
    </p>
    <progress v-if="working && file" :value="progress" max="100" class="mt-3 w-full accent-accent" aria-label="封面上传进度" />
    <label class="mt-5 block text-xs text-muted">封面地址<input v-model="address" :disabled="disabled || working" placeholder="https:// 或 /images/..." class="field-control mt-2 w-full px-3" @keydown.enter.prevent="apply(address.trim())"></label>
    <BaseButton class="mt-3 w-full" variant="border" :loading="working && !file" :disabled="disabled || working || !address.trim() || address.trim() === cover" @click="file = null; apply(address.trim())">
      使用地址
    </BaseButton>
    <BaseButton v-if="cover" class="mt-2 w-full text-error" variant="ghost" :disabled="disabled || working" @click="file = null; apply(undefined)">
      移除封面
    </BaseButton>
    <p v-if="error" role="alert" class="mt-3 text-xs text-error">
      {{ error }}
    </p>
  </section>
</template>
