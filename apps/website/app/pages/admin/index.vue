<script setup lang="ts">
import type { AdminArticleRow } from '#shared/admin/articles'
import type { Draft } from '#shared/admin/model'
import { aiStatusLabels, aiTypeLabels, aiTypes, filterArticleRows } from '#shared/admin/articles'

definePageMeta({ layout: 'admin' })
useSeoMeta({ title: '文章管理' })
const { current, request } = useAdminSession()
const rows = ref<AdminArticleRow[]>([])
const query = ref('')
const filter = ref('all')
const aiType = ref('all')
const aiStatus = ref('all')
const page = ref(1)
const error = ref('')
const loading = ref(false)
const loaded = ref(false)
const editing = ref<string[]>([])
const newPath = ref('')
const creating = ref(false)
let sequence = 0
const filtered = computed(() => filterArticleRows(rows.value, query.value, filter.value, aiType.value, aiStatus.value))
const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / 20)))
const visibleRows = computed(() => filtered.value.slice((page.value - 1) * 20, page.value * 20))
watch([query, filter, aiType, aiStatus], () => {
  page.value = 1
})
watch(pageCount, (count) => {
  page.value = Math.min(page.value, count)
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
async function edit(path: string) {
  if (editing.value.includes(path))
    return
  editing.value.push(path)
  error.value = ''
  try {
    const draft = await request<Draft>('drafts', { method: 'POST', body: { path } })
    await navigateTo(`/admin/editor/${draft.id}`)
  }
  catch (cause) { error.value = adminError(cause) }
  finally { editing.value = editing.value.filter(value => value !== path) }
}
function date(value: string) {
  return value ? value.slice(0, 10) : '—'
}
watch(() => current.value.user?.owner, () => {
  void load()
}, { immediate: true })
</script>

<template>
  <div>
    <div class="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="text-page text-heading">
          文章
        </h1><p class="mt-2 text-muted">
          管理内容、发布进度与 AI 生成结果。
        </p>
      </div>
      <BaseButton :aria-expanded="creating" @click="creating = !creating">
        <span class="i-lucide-plus mr-2" aria-hidden="true" />新建文章
      </BaseButton>
    </div>
    <form v-if="creating" class="mb-6 border border-line rounded-panel bg-surface p-5" @submit.prevent="edit(newPath)">
      <label for="new-path" class="mb-2 block text-heading">文件路径</label>
      <div class="flex flex-wrap gap-3">
        <input id="new-path" v-model="newPath" required placeholder="notes/example.md" class="field-control min-w-0 flex-1 px-3"><BaseButton type="submit" :loading="editing.includes(newPath)">
          创建草稿
        </BaseButton>
      </div>
      <p class="mt-2 text-xs text-muted">
        相对于文章目录，发布后路径固定。
      </p>
    </form>
    <div class="grid mb-5 gap-3 md:grid-cols-[minmax(160px,1fr)_repeat(3,minmax(120px,160px))_auto]">
      <input v-model="query" aria-label="搜索文章" placeholder="搜索标题或文件路径" class="field-control min-w-0 px-4">
      <BaseSelect v-model="filter" aria-label="文章状态" :options="[{ value: 'all', label: '全部文章' }, { value: 'drafts', label: '草稿与待更新' }, { value: 'published', label: '已发布' }]" />
      <BaseSelect v-model="aiType" aria-label="AI 类型" :options="[{ value: 'all', label: '全部 AI 类型' }, ...aiTypes.map(value => ({ value, label: aiTypeLabels[value] }))]" />
      <BaseSelect v-model="aiStatus" aria-label="AI 状态" :options="[{ value: 'all', label: '全部 AI 状态' }, ...Object.entries(aiStatusLabels).map(([value, label]) => ({ value, label }))]" />
      <BaseButton variant="border" :loading="loading" @click="load">
        刷新
      </BaseButton>
    </div>
    <p v-if="error" role="alert" class="mb-5 text-error">
      {{ error }} <button class="control-base ui-link" @click="load">
        重试
      </button>
    </p>
    <AdminSkeleton v-if="loading && !loaded" label="正在读取文章与 AI 状态…" />
    <div v-else :aria-busy="loading" class="overflow-hidden border border-line rounded-panel">
      <div class="article-row hidden bg-surface px-5 py-3 text-xs text-muted lg:grid" aria-hidden="true">
        <span>文章</span><span>发布 / 更新</span><span>发布状态</span><span>AI 生成状态</span><span>操作</span>
      </div>
      <article v-for="row in visibleRows" :key="row.path" class="article-row grid items-center gap-4 border-t border-line px-5 py-4 first:border-t-0">
        <div class="min-w-0">
          <button class="control-base ui-link max-w-full break-words text-left text-heading font-semibold" :disabled="editing.includes(row.path)" @click="edit(row.path)">
            {{ row.title }}
          </button><p class="mt-1 break-all text-xs text-muted">
            {{ row.path }}
          </p>
        </div>
        <div class="text-xs text-muted">
          <p><span class="lg:hidden">发布 </span><time :datetime="row.publish || undefined">{{ date(row.publish) }}</time></p>
          <p v-if="row.update" class="mt-1">
            <span class="lg:hidden">更新 </span><time :datetime="row.update">{{ date(row.update) }}</time>
          </p>
          <p v-if="row.editedAt" class="mt-1" :title="new Date(row.editedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })">
            草稿保存 {{ date(row.editedAt) }}
          </p>
        </div>
        <BaseTag :tone="row.publication.hasChanges ? 'warn' : 'success'" class="text-xs">
          {{ !row.publication.published ? row.publication.hasPublished ? '已撤下' : '草稿' : row.publication.hasChanges ? '有未发布修改' : '已发布' }}
        </BaseTag>
        <div class="flex flex-wrap items-center gap-x-2">
          <AdminAiTag v-for="kind in aiTypes" :key="kind" :kind="kind" :state="row.ai[kind]" :path="row.path" :changed="row.audioSourceChanged" />
        </div>
        <BaseButton variant="ghost" :loading="editing.includes(row.path)" class="justify-self-start" @click="edit(row.path)">
          编辑
        </BaseButton>
      </article>
      <p v-if="!visibleRows.length" class="p-8 text-center text-muted">
        {{ rows.length ? '没有匹配的文章，请调整筛选条件。' : '暂无文章，可新建草稿。' }}
      </p>
    </div>
    <div v-if="loaded" class="mt-5 flex flex-wrap items-center gap-3 text-xs text-muted">
      <span class="mr-auto">共 {{ filtered.length }} 篇 · 每页 20 条</span><BaseButton variant="border" :disabled="page <= 1" @click="page--">
        上一页
      </BaseButton><span aria-live="polite">{{ page }} / {{ pageCount }}</span><BaseButton variant="border" :disabled="page >= pageCount" @click="page++">
        下一页
      </BaseButton>
    </div>
  </div>
</template>

<style scoped>
@media (min-width: 1200px) {
  .article-row { grid-template-columns: minmax(160px, 1.4fr) 130px 110px minmax(210px, 1.2fr) 80px; }
}
</style>
