<script setup lang="ts">
import type { ArticleEntry, Draft } from '#shared/admin/model'
import { articleTitle } from '#shared/admin/model'

definePageMeta({ layout: 'admin' })
useSeoMeta({ title: '文章管理' })
const { current, request } = useAdminSession()
const articles = ref<ArticleEntry[]>([])
const drafts = ref<Draft[]>([])
const query = ref('')
const filter = ref('all')
const error = ref('')
const busy = ref(false)
const newPath = ref('')
const creating = ref(false)
const rows = computed(() => {
  const all = [...articles.value.map(article => ({ path: article.path, title: article.draft ? articleTitle(article.draft.source, article.title) : article.title, draft: article.draft, published: true, changed: article.publication.hasChanges })), ...drafts.value.filter(draft => !articles.value.some(article => article.path === draft.path)).map(draft => ({ path: draft.path, title: articleTitle(draft.source, draft.path), draft, published: false, changed: true }))]
  return all.filter(row => (filter.value === 'all' || (filter.value === 'drafts' ? row.changed : row.published)) && `${row.title} ${row.path}`.toLowerCase().includes(query.value.toLowerCase()))
})
async function load() {
  if (!current.value.user?.owner)
    return
  busy.value = true
  error.value = ''
  try {
    const result = await request<{ articles: ArticleEntry[], drafts: Draft[] }>('articles')
    articles.value = result.articles
    drafts.value = result.drafts
  }
  catch (cause) { error.value = adminError(cause) }
  finally { busy.value = false }
}
async function edit(path: string) {
  busy.value = true
  error.value = ''
  try {
    const draft = await request<Draft>('drafts', { method: 'POST', body: { path } })
    await navigateTo(`/admin/editor/${draft.id}`)
  }
  catch (cause) { error.value = adminError(cause) }
  finally { busy.value = false }
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
          管理已发布文章与未发布的修改。
        </p>
      </div><BaseButton @click="creating = !creating">
        新建文章
      </BaseButton>
    </div>
    <form v-if="creating" class="mb-6 border border-line rounded-panel bg-surface p-5" @submit.prevent="edit(newPath)">
      <label for="new-path" class="mb-2 block text-heading">文件路径</label><div class="flex flex-wrap gap-3">
        <input id="new-path" v-model="newPath" required placeholder="notes/example.md" class="field-control flex-1 px-3"><BaseButton type="submit" :disabled="busy">
          创建草稿
        </BaseButton>
      </div><p class="mt-2 text-xs text-muted">
        相对于文章目录，发布后路径固定。
      </p>
    </form>
    <div class="mb-5 flex flex-wrap gap-3">
      <input v-model="query" aria-label="搜索文章" placeholder="搜索标题或文件路径" class="field-control flex-1 px-4"><BaseSelect v-model="filter" aria-label="文章状态" :options="[{ value: 'all', label: '全部文章' }, { value: 'drafts', label: '草稿与待发布修改' }, { value: 'published', label: '已发布' }]" class="w-48" /><BaseButton variant="border" :disabled="busy" @click="load">
        刷新
      </BaseButton>
    </div>
    <p v-if="error" role="alert" class="mb-5 text-error">
      {{ error }}
    </p>
    <p v-if="busy" role="status" class="mb-5 text-muted">
      正在加载…
    </p>
    <div class="overflow-hidden border border-line rounded-panel">
      <div v-for="row in rows" :key="row.path" class="flex flex-wrap items-center gap-4 border-b border-line px-5 py-5 last:border-b-0">
        <div class="min-w-0 flex-1">
          <button class="control-base ui-link max-w-full break-words text-left text-heading font-semibold" @click="edit(row.path)">
            {{ row.title }}
          </button><p class="mt-1 break-all text-xs text-muted">
            {{ row.path }}
          </p>
        </div><span class="rounded bg-surface px-3 py-1 text-xs">{{ !row.published ? '草稿' : row.changed ? '有未发布修改' : '已发布' }}</span><BaseButton variant="ghost" :disabled="busy" @click="edit(row.path)">
          编辑
        </BaseButton>
      </div>
      <p v-if="!rows.length && !busy" class="p-8 text-center text-muted">
        {{ query ? '没有匹配的文章。' : '暂无文章，可新建草稿。' }}
      </p>
    </div>
  </div>
</template>
