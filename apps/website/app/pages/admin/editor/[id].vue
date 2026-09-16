<script setup lang="ts">
import type { Asset, Draft, Publication } from '#shared/admin/model'
import type { SummaryState } from '#shared/ai/model'
import { parseDocument } from 'yaml'
import { publicationLabels } from '#shared/admin/model'
import { splitDocument } from '#shared/content/document'
import { themeColors } from '#shared/content/schema'

definePageMeta({ layout: 'admin', key: route => route.path })
useSeoMeta({ title: '编辑文章' })
const route = useRoute()
const id = String(route.params.id)
const { current, request, endpoint } = useAdminSession()
const draft = ref<Draft | null>(null)
const source = ref('')
const saved = ref('')
const assets = ref<Asset[]>([])
const imagePreviews = computed(() => Object.fromEntries(assets.value.map(asset => [asset.path, endpoint(`/api/admin/assets/${asset.id}`)])))
const local = ref(false)
const mode = ref<'source' | 'rich' | 'preview'>('source')
const segments = ref<{ source: string, raw: boolean }[]>([])
const richKey = ref(0)
const preview = ref<{ body: Record<string, unknown>, data: Record<string, unknown> } | null>(null)
const metadata = computed(() => {
  try {
    return parseDocument(splitDocument(source.value).yaml).toJS({ maxAliasCount: 20 }) as Record<string, unknown> ?? {}
  }
  catch { return {} }
})
const error = ref('')
const notice = ref('')
const saving = ref(false)
const busy = ref(false)
const summaryBusy = ref(false)
const summaryState = ref<SummaryState | null>(null)
const summaryText = ref('')
const summaryEdited = ref(false)
const summaryError = ref('')
const dirty = computed(() => source.value !== saved.value)
const publication = ref<Publication | null>(null)
const remote = ref<{ source: string, hash: string } | null | undefined>()
const confirmAction = ref<'delete' | 'unpublish' | 'rebase' | null>(null)
const imageUrl = ref('')
const imageAlt = ref('')
const { upload, progress, uploading, remove: deleteAsset } = useAssetUpload()
let saveWork: Promise<boolean> | null = null
let timer: ReturnType<typeof setTimeout> | undefined
let summaryRequest = 0
let operation: { id: string, version: number, action: 'publish' | 'unpublish' } | null = null

async function load() {
  if (!current.value.user?.owner || draft.value)
    return
  try {
    const result = await request<{ draft: Draft, assets: Asset[], local: boolean }>(`drafts/${id}`)
    draft.value = result.draft
    source.value = saved.value = result.draft.source
    assets.value = result.assets
    local.value = result.local
    await loadSummary()
  }
  catch (cause) { error.value = adminError(cause) }
}
watch(() => current.value.user?.owner, () => {
  void load()
}, { immediate: true })
function changeSource(value: string) {
  source.value = value
  error.value = ''
  clearTimeout(timer)
  timer = setTimeout(() => {
    void save()
  }, 1200)
}
async function saveSource(): Promise<boolean> {
  clearTimeout(timer)
  if (saveWork) {
    await saveWork
    return dirty.value ? saveSource() : !error.value
  }
  if (!draft.value || !dirty.value)
    return true
  saving.value = true
  saveWork = (async () => {
    try {
      while (draft.value && dirty.value) {
        const snapshot = source.value
        draft.value = await request<Draft>(`drafts/${id}`, { method: 'PUT', body: { version: draft.value.version, source: snapshot } })
        if (source.value === snapshot)
          source.value = draft.value.source
        saved.value = draft.value.source
      }
      error.value = ''
      return true
    }
    catch (cause) {
      error.value = adminError(cause)
      return false
    }
    finally {
      saving.value = false
      saveWork = null
    }
  })()
  return saveWork
}
async function save(): Promise<boolean> {
  const result = await saveSource()
  return result && summaryEdited.value && !summaryBusy.value ? updateSummary('save') : result
}
function editSummary() {
  summaryEdited.value = true
  clearTimeout(timer)
  timer = setTimeout(() => {
    void save()
  }, 1200)
}
async function loadSummary() {
  const sequence = ++summaryRequest
  const version = draft.value?.version
  const result = await request<SummaryState>(`drafts/${id}/summary`)
  if (sequence !== summaryRequest || version !== draft.value?.version || summaryBusy.value)
    return
  summaryState.value = result
  if (!summaryEdited.value)
    summaryText.value = summaryState.value.record?.text ?? ''
}
async function updateSummary(action: 'generate' | 'save'): Promise<boolean> {
  if (summaryBusy.value)
    return false
  summaryBusy.value = true
  summaryRequest++
  summaryError.value = ''
  try {
    if (!await saveSource() || !draft.value)
      return false
    const snapshot = source.value
    const result = await request<{ draft: Draft, summary: SummaryState }>(`drafts/${id}/summary`, { method: 'POST', body: { action, version: draft.value.version, ...(action === 'save' ? { text: summaryText.value } : {}) } })
    if (result.draft.version < draft.value.version)
      return false
    draft.value = result.draft
    saved.value = result.draft.source
    if (source.value !== snapshot) {
      summaryError.value = '文章已继续编辑，摘要将按最新内容重新检查。'
      await saveSource()
      return true
    }
    source.value = saved.value = result.draft.source
    summaryState.value = result.summary
    summaryText.value = result.summary.record?.text ?? ''
    summaryEdited.value = false
    return true
  }
  catch (cause) {
    summaryError.value = adminError(cause)
    return false
  }
  finally {
    summaryBusy.value = false
    await loadSummary().catch(() => {})
    if (mode.value === 'preview')
      await switchMode('preview')
  }
}
const summaryStatus = computed(() => {
  if (metadata.value.aiSummary === false)
    return '已关闭'
  if (summaryError.value)
    return '生成或保存失败'
  if (dirty.value)
    return '文章已修改，保存后检查摘要'
  return ({ disabled: '未启用', missing: '尚未生成', valid: '有效', stale: '已过期', unavailable: '暂不可用' })[summaryState.value?.status ?? 'missing']
})
watch(saving, (value) => {
  if (!value && draft.value)
    void loadSummary().catch(() => {})
})
async function switchMode(next: typeof mode.value) {
  busy.value = true
  error.value = ''
  try {
    if (next === 'rich') {
      const result = await request<{ segments: typeof segments.value }>(`drafts/${id}/segments`, { method: 'POST', body: { source: source.value } })
      segments.value = result.segments
      richKey.value++
    }
    if (next === 'preview')
      preview.value = await request(`drafts/${id}/preview`, { method: 'POST', body: { source: source.value } })
    mode.value = next
  }
  catch (cause) { error.value = adminError(cause) }
  finally { busy.value = false }
}
function setMeta(field: string, value: unknown) {
  const parts = splitDocument(source.value)
  try {
    const document = parseDocument(parts.yaml || '{}')
    if (document.errors.length) {
      error.value = '请先在源码模式修正 YAML 格式'
      return
    }
    if (value === undefined)
      document.delete(field)
    else
      document.set(field, value)
    changeSource(`---\n${document.toString()}---\n${parts.body}`)
  }
  catch { error.value = '元数据格式无效，请在源码模式修正' }
}
function addImage(path: string) {
  const alt = imageAlt.value.replace(/[[\]\\\r\n]/g, '')
  changeSource(`${source.value.trimEnd()}\n\n![${alt}](${path})\n`)
  mode.value = 'source'
}
async function selectImage(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file)
    return
  try {
    const asset = await upload(id, file)
    if (!assets.value.some(item => item.id === asset.id))
      assets.value.push(asset)
    notice.value = '图片已私有暂存，可插入正文或设为封面。'
  }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '上传失败' }
  input.value = ''
}
async function publish(action: 'publish' | 'unpublish' = 'publish') {
  confirmAction.value = null
  if (!await save() || !draft.value)
    return
  busy.value = true
  error.value = ''
  notice.value = ''
  if (!operation || operation.version !== draft.value.version || operation.action !== action)
    operation = { id: crypto.randomUUID(), version: draft.value.version, action }
  try {
    publication.value = await request<Publication>('publications', { method: 'POST', body: { draftId: id, version: operation.version, operationId: operation.id, action } })
    const refreshed = await request<{ draft: Draft, assets: Asset[] }>(`drafts/${id}`)
    draft.value = refreshed.draft
    assets.value = refreshed.assets
    notice.value = publicationLabels[publication.value.status]
  }
  catch (cause) { error.value = adminError(cause) }
  finally { busy.value = false }
}
async function showRemote() {
  try {
    remote.value = (await request<{ file: { source: string, hash: string } | null }>(`drafts/${id}/remote`)).file
  }
  catch (cause) { error.value = adminError(cause) }
}
async function confirm() {
  if (!draft.value)
    return
  if (confirmAction.value === 'unpublish')
    return publish('unpublish')
  busy.value = true
  try {
    if (confirmAction.value === 'delete') {
      await request(`drafts/${id}?version=${draft.value.version}`, { method: 'DELETE' })
      saved.value = source.value
      await navigateTo('/admin')
    }
    if (confirmAction.value === 'rebase') {
      if (!await save())
        return
      draft.value = await request<Draft>(`drafts/${id}/rebase`, { method: 'POST', body: { version: draft.value.version, hash: remote.value?.hash ?? null } })
      remote.value = undefined
      notice.value = '已更新发布基准，当前草稿内容已保留。'
    }
  }
  catch (cause) { error.value = adminError(cause) }
  finally {
    busy.value = false
    confirmAction.value = null
  }
}
async function removeAsset(asset: Asset) {
  if (!await save())
    return
  try {
    await deleteAsset(asset)
    assets.value = assets.value.filter(item => item.id !== asset.id)
  }
  catch (cause) { error.value = adminError(cause) }
}
onBeforeRouteLeave(async () => (!dirty.value && !summaryEdited.value) || await save())
function beforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value || summaryEdited.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}
function shortcut(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    void save()
  }
}
onMounted(() => {
  window.addEventListener('beforeunload', beforeUnload)
  window.addEventListener('keydown', shortcut)
})
onBeforeUnmount(() => {
  clearTimeout(timer)
  window.removeEventListener('beforeunload', beforeUnload)
  window.removeEventListener('keydown', shortcut)
})
</script>

<template>
  <div>
    <div class="mb-6 flex flex-wrap items-center gap-3">
      <div class="min-w-0 w-full md:w-auto md:flex-1">
        <NuxtLink to="/admin" class="text-xs text-muted hover:text-heading">
          返回文章
        </NuxtLink><h1 class="mt-2 break-all text-section text-heading">
          {{ draft?.path || '加载文章' }}
        </h1><p class="mt-1 text-xs text-muted" role="status">
          {{ saving ? '正在保存草稿…' : summaryBusy ? '正在处理摘要…' : dirty || summaryEdited ? '有未保存修改' : draft ? '草稿已保存' : '' }}
        </p>
      </div><BaseButton variant="border" :disabled="saving || summaryBusy || busy || !draft" @click="save">
        保存草稿
      </BaseButton><BaseButton :disabled="busy || summaryBusy || !draft || uploading" @click="publish()">
        {{ local ? '发布到本地' : '发布到网站' }}
      </BaseButton>
    </div>
    <p v-if="error" role="alert" class="mb-5 border border-error rounded-button p-4 text-error">
      {{ error }} <button class="ml-3 underline" @click="showRemote">
        查看已发布版本
      </button>
    </p>
    <p v-if="notice" role="status" class="mb-5 text-success">
      {{ notice }} <NuxtLink v-if="publication" to="/admin/publications" class="underline">
        查看发布记录
      </NuxtLink>
    </p>
    <div v-if="draft" class="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <section class="min-w-0">
        <div class="mb-4 flex gap-2" role="group" aria-label="编辑模式">
          <button v-for="tab in (['rich', 'source', 'preview'] as const)" :key="tab" class="min-h-11 rounded-button px-5" :class="mode === tab ? 'bg-accent-surface text-accent-soft' : 'hover:bg-surface'" :aria-pressed="mode === tab" :disabled="busy" @click="switchMode(tab)">
            {{ { rich: '富文本', source: '源码', preview: '预览' }[tab] }}
          </button>
        </div>
        <textarea v-if="mode === 'source'" :value="source" aria-label="完整 Markdown 与 MDC 源码" spellcheck="false" class="min-h-[65dvh] w-full resize-y border border-line-strong rounded-panel bg-canvas p-5 text-xs leading-7 font-mono" @input="changeSource(($event.target as HTMLTextAreaElement).value)" />
        <LazyRichEditor v-else-if="mode === 'rich'" :key="richKey" :segments="segments" :image-previews="imagePreviews" @change="changeSource(splitDocument(source).header + $event)" />
        <div v-else-if="preview" class="border border-line rounded-panel p-5">
          <h2 class="mb-4 text-page text-themed">
            {{ preview.data.title }}
          </h2><p v-if="preview.data.summarySource !== 'ai'" class="mb-5 text-muted">
            {{ preview.data.description }}
          </p><img v-if="typeof preview.data.cover === 'string'" :src="preview.data.cover" alt="文章封面预览" class="mb-6 max-w-full rounded-panel"><ArticleSummary v-if="preview.data.summarySource === 'ai'" :text="String(preview.data.description)" /><ArticleBody :content-key="source">
            <ContentRenderer :value="{ ...preview.data, body: preview.body }" />
          </ArticleBody>
        </div>
        <section v-if="remote !== undefined" class="mt-6 border border-warn rounded-panel p-5">
          <h2 class="mb-3 text-heading">
            已发布版本
          </h2><p class="mb-3 text-xs text-muted">
            请对照当前草稿处理差异。更新发布基准会保留当前草稿，之后发布将替换下方版本。
          </p><div class="grid gap-4 md:grid-cols-2">
            <div class="min-w-0">
              <h3 class="mb-2 text-xs text-muted">
                当前草稿
              </h3><pre class="max-h-96 overflow-auto whitespace-pre-wrap break-all bg-surface p-4 text-xs">{{ source }}</pre>
            </div>
            <div class="min-w-0">
              <h3 class="mb-2 text-xs text-muted">
                已发布版本
              </h3><pre class="max-h-96 overflow-auto whitespace-pre-wrap break-all bg-surface p-4 text-xs">{{ remote?.source ?? '文章已不存在。' }}</pre>
            </div>
          </div><BaseButton class="mt-4" variant="border" @click="confirmAction = 'rebase'">
            以此版本作为发布基准
          </BaseButton>
        </section>
      </section>
      <aside class="min-w-0 space-y-6">
        <section class="border border-line rounded-panel p-5">
          <h2 class="mb-4 text-heading font-semibold">
            AI 摘要
          </h2>
          <label class="min-h-11 flex items-center gap-3 text-sm"><input type="checkbox" :checked="metadata.aiSummary !== false" :disabled="summaryBusy" @change="setMeta('aiSummary', ($event.target as HTMLInputElement).checked)">此文章启用 AI 摘要</label>
          <p class="my-3 text-xs text-muted" role="status">
            {{ summaryStatus }}
          </p>
          <label class="block text-xs text-muted">摘要内容<textarea v-model="summaryText" rows="5" maxlength="300" :disabled="summaryBusy || metadata.aiSummary === false" class="mt-2 w-full border border-line-strong rounded-button bg-canvas p-3 text-ink leading-7" @input="editSummary" /></label>
          <p v-if="summaryState?.message" class="mt-3 text-xs text-muted">
            {{ summaryState.message }}
          </p>
          <p v-if="summaryError" role="alert" class="mt-3 text-xs text-error">
            {{ summaryError }}
          </p>
          <div class="mt-4 flex flex-wrap gap-3">
            <BaseButton variant="border" :disabled="summaryBusy || busy || metadata.aiSummary === false" @click="updateSummary('generate')">
              {{ summaryBusy ? '处理中…' : summaryState?.record ? '重新生成' : '生成摘要' }}
            </BaseButton>
            <BaseButton variant="border" :disabled="summaryBusy || busy || !summaryEdited || !summaryText.trim() || metadata.aiSummary === false" @click="updateSummary('save')">
              保存摘要
            </BaseButton>
          </div>
          <NuxtLink to="/admin/ai" class="mt-4 inline-block text-xs text-accent-soft">
            AI 服务设置
          </NuxtLink>
        </section>
        <section class="border border-line rounded-panel p-5">
          <h2 class="mb-4 text-heading font-semibold">
            文章信息
          </h2><div class="space-y-4">
            <label v-for="field in [{ key: 'title', label: '标题', type: 'text' }, { key: 'description', label: '原简介（必填）', type: 'text' }, { key: 'publish', label: '发布日期', type: 'date' }, { key: 'update', label: '更新日期', type: 'date' }, { key: 'cover', label: '封面地址', type: 'text' }]" :key="field.key" class="block text-xs text-muted">{{ field.label }}<input :type="field.type" :value="metadata[field.key] ?? ''" class="mt-2 min-h-11 w-full border border-line-strong rounded-button bg-canvas px-3 text-ink" @change="setMeta(field.key, ($event.target as HTMLInputElement).value || undefined)"></label><label class="block text-xs text-muted">标签<input :value="Array.isArray(metadata.tags) ? metadata.tags.join(', ') : ''" class="mt-2 min-h-11 w-full border border-line-strong rounded-button bg-canvas px-3 text-ink" @change="setMeta('tags', ($event.target as HTMLInputElement).value.split(/[,，]/).map(v => v.trim()).filter(Boolean))"></label><label class="block text-xs text-muted">专栏<input :value="Array.isArray(metadata.categories) ? metadata.categories.join(', ') : ''" class="mt-2 min-h-11 w-full border border-line-strong rounded-button bg-canvas px-3 text-ink" @change="setMeta('categories', ($event.target as HTMLInputElement).value.split(/[,，]/).map(v => v.trim()).filter(Boolean))"></label><label class="block text-xs text-muted">置顶权重<input type="number" min="0" :value="metadata.pin ?? 0" class="mt-2 min-h-11 w-full border border-line-strong rounded-button bg-canvas px-3 text-ink" @change="setMeta('pin', Number(($event.target as HTMLInputElement).value))"></label><label class="min-h-11 flex items-center gap-3"><input type="checkbox" :checked="!!metadata.wip" @change="setMeta('wip', ($event.target as HTMLInputElement).checked)">显示施工提醒</label>
          </div>
          <label class="mt-4 block text-xs text-muted">主题色<select :value="metadata.theme ?? '#a369ff'" class="mt-2 min-h-11 w-full border border-line-strong rounded-button bg-canvas px-3 text-ink" @change="setMeta('theme', ($event.target as HTMLSelectElement).value)"><option v-for="color in themeColors" :key="color" :value="color">{{ color }}</option></select></label>
        </section>
        <section class="border border-line rounded-panel p-5">
          <h2 class="mb-4 text-heading font-semibold">
            图片
          </h2><label class="block text-xs text-muted">图片说明<input v-model="imageAlt" class="mt-2 min-h-11 w-full border border-line-strong rounded-button bg-canvas px-3 text-ink"></label><label class="mt-4 block text-xs text-muted">上传图片<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" :disabled="uploading" class="mt-2 block w-full text-xs" @change="selectImage"></label><progress v-if="uploading" :value="progress" max="100" class="mt-3 w-full" aria-label="图片上传进度" /><p class="mt-2 text-xs text-muted">
            单张最多 5 MiB。发布前仅站主可见。
          </p><div v-for="asset in assets" :key="asset.id" class="mt-4 border-t border-line pt-4">
            <img :src="endpoint(`/api/admin/assets/${asset.id}`)" alt="暂存图片预览" class="max-h-36 w-full rounded object-contain"><div class="mt-2 flex flex-wrap gap-2">
              <button class="min-h-11 text-xs text-accent-soft" @click="addImage(asset.path)">
                插入正文
              </button><button class="min-h-11 text-xs text-accent-soft" @click="setMeta('cover', asset.path)">
                设为封面
              </button><button class="min-h-11 text-xs text-muted" @click="removeAsset(asset)">
                删除暂存
              </button>
            </div>
          </div><label class="mt-4 block text-xs text-muted">图片地址<input v-model="imageUrl" placeholder="https:// 或 /images/..." class="mt-2 min-h-11 w-full border border-line-strong rounded-button bg-canvas px-3 text-ink"></label><BaseButton class="mt-2 w-full" variant="border" :disabled="!/^(https?:\/\/\S+|\/(?!\/)[^\s)]+)$/.test(imageUrl)" @click="addImage(imageUrl)">
            插入地址
          </BaseButton>
        </section>
        <div class="flex flex-wrap gap-3">
          <BaseButton v-if="draft.baseHash" variant="ghost" :disabled="busy" @click="confirmAction = 'unpublish'">
            撤下文章
          </BaseButton><BaseButton variant="ghost" :disabled="busy" @click="confirmAction = 'delete'">
            删除编辑草稿
          </BaseButton>
        </div>
      </aside>
    </div>
    <AcrylicDialog :model-value="!!confirmAction" title="确认操作" @update:model-value="value => { if (!value) confirmAction = null }">
      <p class="mb-5">
        {{ confirmAction === 'delete' ? '删除这个编辑草稿及其私有暂存图片？已发布文章不受影响。' : confirmAction === 'unpublish' ? '撤下已发布文章？数据库中的编辑稿会保留。' : '确认已完成差异处理？下一次发布将用当前草稿替换查看过的版本。' }}
      </p><div class="flex gap-3">
        <BaseButton :disabled="busy" @click="confirm">
          确认
        </BaseButton><BaseButton variant="border" @click="confirmAction = null">
          取消
        </BaseButton>
      </div>
    </AcrylicDialog>
  </div>
</template>
