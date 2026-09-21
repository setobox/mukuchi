<script setup lang="ts">
import type { AdminArticleRow } from '#shared/admin/articles'
import type { Draft } from '#shared/admin/model'
import type { SummaryState } from '#shared/ai/model'
import type { BatchItem } from '~/features/admin/batch'
import { aiStatusLabels, aiStatusTone, filterArticleRows } from '#shared/admin/articles'
import { runSummaryBatch } from '~/features/admin/batch'

const props = defineProps<{ revision: number }>()
const emit = defineEmits<{ busy: [value: boolean] }>()
const { current, request } = useAdminSession()
const { notify } = useAdminFeedback()
const route = useRoute()
const rows = ref<AdminArticleRow[]>([])
const loading = ref(false)
const loaded = ref(false)
const error = ref('')
const query = ref('')
const status = ref('all')
const page = ref(1)
const selected = ref<string[]>([])
const items = ref<BatchItem[]>([])
const running = ref(false)
const stopped = ref(false)
const editing = ref<AdminArticleRow | null>(null)
const text = ref('')
const original = ref('')
const saving = ref(false)
const editorError = ref('')
const confirmation = ref('')
let resolveConfirmation: ((value: boolean) => void) | undefined
function confirmChange(message: string) {
  confirmation.value = message
  return new Promise<boolean>((resolve) => {
    resolveConfirmation = resolve
  })
}
function answerConfirmation(value: boolean) {
  confirmation.value = ''
  resolveConfirmation?.(value)
  resolveConfirmation = undefined
}
let sequence = 0
let work: Promise<void> | null = null
const filtered = computed(() => filterArticleRows(rows.value, query.value, 'all', 'summary', status.value))
const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / 20)))
const visible = computed(() => filtered.value.slice((page.value - 1) * 20, page.value * 20))
const completed = computed(() => items.value.filter(item => ['succeeded', 'failed', 'cancelled'].includes(item.status)).length)
const failed = computed(() => items.value.filter(item => item.status === 'failed'))
const counts = computed(() => ({
  succeeded: items.value.filter(item => item.status === 'succeeded').length,
  cancelled: items.value.filter(item => item.status === 'cancelled').length,
}))
const taskLabels = { pending: '等待生成', running: '正在生成', succeeded: '已保存编辑稿', failed: '生成失败', cancelled: '已停止' }
watch(() => route.query.article, (value) => {
  query.value = typeof value === 'string' ? value : ''
}, { immediate: true })
watch([query, status], () => {
  page.value = 1
})
watch(pages, (value) => {
  page.value = Math.min(value, page.value)
})
async function load() {
  if (!current.value.user?.owner)
    return
  const token = ++sequence
  loading.value = true
  error.value = ''
  try {
    const result = await request<{ rows: AdminArticleRow[] }>('articles')
    if (token !== sequence)
      return
    rows.value = result.rows
    selected.value = selected.value.filter(path => rows.value.some(row => row.path === path))
    loaded.value = true
  }
  catch (cause) {
    if (token === sequence)
      error.value = adminError(cause)
  }
  finally {
    if (token === sequence)
      loading.value = false
  }
}
watch(() => current.value.user?.owner, () => {
  void load()
}, { immediate: true })
watch(() => props.revision, () => {
  if (!running.value)
    void load()
})
watch([running, saving], () => emit('busy', running.value || saving.value))
function selectVisible() {
  selected.value = visible.value.filter(row => row.ai.summary.status !== 'disabled').map(row => row.path)
}
async function saveSummary(row: AdminArticleRow, action: 'generate' | 'save', value?: string) {
  const draft = await request<Draft>('drafts', { method: 'POST', body: { path: row.path } })
  if (row.draft && row.draft.version !== draft.version)
    throw new Error('编辑稿已在其他窗口修改，请刷新列表后重试。')
  const result = await request<{ draft: Draft, summary: SummaryState }>(`drafts/${draft.id}/summary`, {
    method: 'POST',
    body: { action, version: draft.version, ...(action === 'save' ? { text: value } : {}) },
  })
  row.draft = { id: result.draft.id, version: result.draft.version }
  row.ai.summary = result.summary
}
function message(cause: unknown) {
  return cause instanceof Error && !('data' in cause) ? cause.message : adminError(cause)
}
async function generate(paths: string[]) {
  if (running.value || saving.value || !paths.length || paths.length > 50)
    return
  const snapshots = new Map(rows.value.filter(row => paths.includes(row.path)).map(row => [row.path, structuredClone(toRaw(row))]))
  items.value = paths.map(path => ({ path, title: snapshots.get(path)?.title ?? path, status: 'pending', message: '' }))
  running.value = true
  stopped.value = false
  work = runSummaryBatch(items.value, async (item) => {
    const row = snapshots.get(item.path)
    if (!row)
      throw new Error('文章已不存在，请刷新列表。')
    await saveSummary(row, 'generate')
    const index = rows.value.findIndex(value => value.path === row.path)
    if (index >= 0)
      rows.value[index] = row
  }, () => stopped.value, message)
  try {
    await work
    notify(`摘要任务完成：成功 ${counts.value.succeeded}，失败 ${failed.value.length}。结果保存在编辑稿中。`)
    selected.value = failed.value.map(item => item.path)
    await load()
  }
  finally {
    running.value = false
    work = null
  }
}
function openEditor(row: AdminArticleRow) {
  editing.value = structuredClone(toRaw(row))
  text.value = original.value = row.ai.summary.record?.text ?? ''
  editorError.value = ''
}
async function closeEditor(open: boolean) {
  if (!open && !saving.value && (text.value === original.value || await confirmChange('摘要尚未保存，放弃这些修改？')))
    editing.value = null
}
async function saveEdited() {
  if (!editing.value || saving.value)
    return
  saving.value = true
  editorError.value = ''
  try {
    await saveSummary(editing.value, 'save', text.value)
    editing.value = null
    notify('摘要已保存到编辑稿，发布或更新文章后上线。')
    await load()
  }
  catch (cause) { editorError.value = message(cause) }
  finally { saving.value = false }
}
onBeforeRouteLeave(async () => {
  if (editing.value && text.value !== original.value && !await confirmChange('摘要尚未保存，仍要离开？'))
    return false
  if (!running.value)
    return true
  if (!await confirmChange('还有摘要任务未完成。停止后续任务，并在当前请求完成后离开？'))
    return false
  stopped.value = true
  await work
  return true
})
function beforeUnload(event: BeforeUnloadEvent) {
  if (running.value || (editing.value && text.value !== original.value)) {
    event.preventDefault()
    event.returnValue = ''
  }
}
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => {
  answerConfirmation(false)
  stopped.value = true
  window.removeEventListener('beforeunload', beforeUnload)
})
</script>

<template>
  <section class="mt-10 border-t border-line pt-8" aria-label="文章摘要管理">
    <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
      <h2 class="text-section text-heading">
        文章摘要
      </h2>
      <BaseButton variant="border" :loading="loading" :disabled="running || saving" @click="load">
        刷新列表
      </BaseButton>
    </div>
    <p class="mb-5 text-sm text-muted">
      生成和编辑只保存到编辑稿，发布或更新文章后才会上线。生成使用已保存的服务设置。
    </p>
    <p v-if="error" role="alert" class="mb-4 text-error">
      {{ error }}
    </p>
    <div class="mb-4 flex flex-wrap gap-3">
      <input v-model="query" class="field-control min-w-0 flex-1 px-3" placeholder="搜索文章标题或路径" aria-label="搜索摘要文章">
      <BaseSelect v-model="status" aria-label="摘要状态" :options="[{ value: 'all', label: '全部状态' }, ...['disabled', 'missing', 'valid', 'stale', 'unavailable'].map(value => ({ value, label: aiStatusLabels[value as keyof typeof aiStatusLabels] }))]" class="w-40" />
    </div>
    <div class="mb-4 flex flex-wrap items-center gap-3">
      <BaseButton variant="border" :disabled="running || saving" @click="selectVisible">
        选择本页
      </BaseButton>
      <BaseButton variant="ghost" :disabled="running || saving || !selected.length" @click="selected = []">
        清空选择
      </BaseButton>
      <BaseButton :loading="running" :disabled="saving || !selected.length || selected.length > 50" @click="generate(selected)">
        生成所选（{{ selected.length }} / 50）
      </BaseButton>
      <BaseButton v-if="running" variant="border" :disabled="stopped" @click="stopped = true">
        {{ stopped ? '等待在途请求完成…' : '停止后续任务' }}
      </BaseButton>
    </div>
    <section v-if="items.length" class="mb-5 border border-line rounded-panel bg-surface p-4" aria-label="摘要批量进度">
      <p role="status" class="text-sm">
        已处理 {{ completed }} / {{ items.length }} · 成功 {{ counts.succeeded }} · 失败 {{ failed.length }} · 停止 {{ counts.cancelled }}
      </p>
      <progress :value="completed" :max="items.length" class="my-3 w-full accent-accent" aria-label="摘要生成进度" />
      <details>
        <summary class="control-base cursor-pointer text-sm text-accent-soft">
          逐篇结果
        </summary>
        <ul class="m-0 max-h-64 list-none overflow-auto p-0 text-xs">
          <li v-for="item in items" :key="item.path" class="border-t border-line py-3">
            {{ item.title }} · {{ taskLabels[item.status] }}<p v-if="item.message" class="mt-1 text-error">
              {{ item.message }}
            </p>
          </li>
        </ul>
      </details>
      <BaseButton v-if="failed.length" class="mt-3" variant="border" :disabled="running || saving" @click="generate(failed.map(item => item.path))">
        重试失败项（{{ failed.length }}）
      </BaseButton>
    </section>
    <AdminSkeleton v-if="loading && !loaded" />
    <div v-else class="overflow-hidden border border-line rounded-panel">
      <article v-for="row in visible" :key="row.path" class="flex flex-wrap items-center gap-3 border-b border-line p-4 last:border-b-0">
        <label class="checkbox-field min-h-11 min-w-11 flex items-center justify-center gap-3">
          <input v-model="selected" type="checkbox" :value="row.path" :disabled="running || saving || row.ai.summary.status === 'disabled' || (selected.length >= 50 && !selected.includes(row.path))" :aria-label="`选择 ${row.title}`" class="accent-accent">
        </label>
        <div class="min-w-0 flex-1">
          <p class="break-words text-heading">
            {{ row.title }}
          </p>
          <p class="mt-1 break-all text-xs text-muted">
            {{ row.path }}
          </p>
          <p v-if="row.ai.summary.record" class="line-clamp-2 mt-2 text-xs text-muted">
            {{ row.ai.summary.record.text }}
          </p>
        </div>
        <BaseTag :tone="aiStatusTone(row.ai.summary.status)" class="text-xs">
          {{ aiStatusLabels[row.ai.summary.status] }}
        </BaseTag>
        <div class="flex gap-2">
          <BaseButton variant="border" :disabled="running || saving || row.ai.summary.status === 'disabled'" @click="openEditor(row)">
            查看 / 编辑
          </BaseButton>
          <BaseButton variant="ghost" :disabled="running || saving || row.ai.summary.status === 'disabled'" @click="generate([row.path])">
            {{ row.ai.summary.record ? '重新生成' : '生成' }}
          </BaseButton>
          <NuxtLink v-if="row.draft" :to="`/admin/editor/${row.draft.id}`" class="ui-link min-h-11 inline-flex items-center text-xs text-accent-soft">
            编辑文章
          </NuxtLink>
        </div>
      </article>
      <p v-if="!visible.length" class="p-8 text-center text-muted">
        没有匹配的文章。
      </p>
    </div>
    <div class="mt-4 flex flex-wrap items-center justify-end gap-3 text-xs text-muted">
      <span class="mr-auto">共 {{ filtered.length }} 篇</span><BaseButton variant="border" :disabled="page <= 1" @click="page--">
        上一页
      </BaseButton><span>{{ page }} / {{ pages }}</span><BaseButton variant="border" :disabled="page >= pages" @click="page++">
        下一页
      </BaseButton>
    </div>
    <AcrylicDialog :model-value="!!confirmation" title="未完成的操作" @update:model-value="!$event && answerConfirmation(false)">
      <p class="mb-5">
        {{ confirmation }}
      </p>
      <div class="flex gap-3">
        <BaseButton variant="border" @click="answerConfirmation(false)">
          继续编辑
        </BaseButton><BaseButton @click="answerConfirmation(true)">
          确认离开
        </BaseButton>
      </div>
    </AcrylicDialog>
    <AcrylicDialog :model-value="!!editing" title="编辑摘要" :dismissible="!saving" @update:model-value="closeEditor">
      <p class="mb-4 break-words text-heading">
        {{ editing?.title }}
      </p>
      <label class="block text-sm text-muted">摘要内容<textarea v-model="text" maxlength="300" rows="7" :disabled="saving" class="field-control mt-2 w-full p-3 leading-7" /></label>
      <p class="mt-2 text-xs text-muted">
        {{ text.length }} / 300 · 保存到编辑稿
      </p>
      <p v-if="editorError" role="alert" class="mt-3 text-error">
        {{ editorError }}
      </p>
      <BaseButton class="mt-5" :loading="saving" :disabled="!text.trim() || text === original" @click="saveEdited">
        保存摘要
      </BaseButton>
    </AcrylicDialog>
  </section>
</template>
