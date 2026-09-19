<script setup lang="ts">
import type { Publication } from '#shared/admin/model'
import { publicationLabels } from '#shared/admin/model'

definePageMeta({ layout: 'admin' })
useSeoMeta({ title: '发布记录' })
const { current, request } = useAdminSession()
const publications = ref<Publication[]>([])
const error = ref('')
const busy = ref(false)
async function load() {
  if (!current.value.user?.owner || busy.value)
    return
  busy.value = true
  try {
    const result = await request<{ publications: Publication[] }>('publications')
    publications.value = result.publications
    for (const record of result.publications.filter(record => ['submitted', 'building', 'unknown'].includes(record.status))) {
      const updated = await request<Publication>(`publications/${record.id}`)
      publications.value = publications.value.map(item => item.id === updated.id ? updated : item)
    }
    error.value = ''
  }
  catch (cause) { error.value = adminError(cause) }
  finally { busy.value = false }
}
async function retry(record: Publication) {
  try {
    await request('publications', { method: 'POST', body: { operationId: record.id, draftId: record.draftId, version: record.version, action: record.action } })
    await load()
  }
  catch (cause) { error.value = adminError(cause) }
}
watch(() => current.value.user?.owner, () => {
  void load()
}, { immediate: true })
const { pause, resume } = useIntervalFn(() => {
  if (document.visibilityState === 'visible' && publications.value.some(record => ['submitted', 'building', 'unknown'].includes(record.status)))
    void load()
}, 15000, { immediate: false })
onMounted(resume)
onBeforeUnmount(pause)
</script>

<template>
  <div>
    <div class="mb-8 flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 class="text-page text-heading">
          发布记录
        </h1><p class="mt-2 text-muted">
          提交成功后，构建与部署仍可能失败。
        </p>
      </div><BaseButton variant="border" :disabled="busy" @click="load">
        刷新状态
      </BaseButton>
    </div><p v-if="error" role="alert" class="mb-5 text-error">
      {{ error }}
    </p><div class="space-y-4">
      <article v-for="record in publications" :key="record.id" class="border border-line rounded-panel p-5">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <NuxtLink :to="`/admin/editor/${record.draftId}`" class="text-link">
            {{ record.action === 'publish' ? '发布文章' : '撤下文章' }} · 版本 {{ record.version }}
          </NuxtLink><span class="rounded bg-surface px-3 py-1 text-xs">{{ publicationLabels[record.status] }}</span>
        </div><p class="mt-3 text-xs text-muted">
          {{ new Date(record.createdAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) }}
        </p><p v-if="record.commit" class="mt-2 break-all text-xs text-muted font-mono">
          {{ record.commit }}
        </p><p v-if="record.message" class="mt-3 text-warn">
          {{ record.message }}
        </p><div class="mt-3 flex flex-wrap gap-4">
          <a v-if="record.url" :href="record.url" target="_blank" rel="noopener noreferrer" class="text-link">查看构建与部署</a><BaseButton v-if="record.status === 'preparing' || record.status === 'failed' && !record.commit" variant="border" @click="retry(record)">
            核实并重试本次发布
          </BaseButton>
        </div>
      </article><p v-if="!publications.length && !busy" class="border border-line rounded-panel p-8 text-center text-muted">
        暂无发布记录。
      </p>
    </div>
  </div>
</template>
