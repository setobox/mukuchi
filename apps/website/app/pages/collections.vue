<script setup lang="ts">
import type { ResourceGroup } from '#shared/collections/types'

definePageMeta({ section: 'collections', pageKind: 'index', pageTitle: '导航', parentPath: '/my' })
useSeoMeta({ title: '导航', description: '网站、开发资源与在线工具收藏。' })

const { data: groups, error, refresh, status } = useLazyFetch<ResourceGroup[]>('/api/collections', {
  default: () => [],
  key: 'collection-groups',
  server: false,
})
</script>

<template>
  <div>
    <PageHeading title="导航" />
    <p class="mb-8 text-muted">
      网站、开发资源与在线工具收藏。
    </p>
    <div v-if="error" role="alert" class="border border-line rounded-panel bg-surface p-6">
      <p>数据加载失败，请稍后重试。</p>
      <BaseButton class="mt-4" variant="border" :loading="status === 'pending'" @click="refresh()">
        重新加载
      </BaseButton>
    </div>
    <p v-else-if="(status === 'idle' || status === 'pending') && !groups.length" role="status" class="py-6 text-muted">
      正在加载…
    </p>
    <div v-else-if="groups.length" class="grid gap-10">
      <ResourceSection v-for="(group, index) in groups" :key="`${index}:${group.title}`" :group="group" />
    </div>
    <ContentEmptyState v-else title="暂无数据" description="这里还没有收藏的网站与资源。" icon="grid" />
  </div>
</template>
