<script setup lang="ts">
import type { TaxonomyFilter } from '#shared/content/taxonomy'
import { filterPosts } from '#shared/content/catalog'

const props = defineProps<{ filter?: TaxonomyFilter }>()
const { data, tags, error, status, refresh } = usePostCatalog()
const tag = computed(() => props.filter?.kind === 'tag' ? props.filter.name : '')
const posts = computed(() =>
  filterPosts(data.value ?? [], props.filter),
)
const preference = useCookie<string>('mukuchi:post-view', {
  default: () => 'list',
  sameSite: 'lax',
  maxAge: 31536000,
})
const view = computed(() => (preference.value === 'grid' ? 'grid' : 'list'))
const filtered = computed(() => !!props.filter)
</script>

<template>
  <SiteColumns>
    <template #sidebar>
      <SiteSidebar
        :tags="tags"
        :selected-tag="tag"
      />
    </template>
    <div>
      <div v-if="tags.length" class="mb-6 lg:hidden">
        <TagFilter :tags="tags" :selected="tag" />
      </div>
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <div v-if="$slots['toolbar-start']" class="min-w-0 flex-[1_1_12rem]">
          <slot name="toolbar-start" />
        </div>
        <p v-else aria-live="polite" class="text-heading">
          {{ filtered ? "筛选结果" : "全部文章"
          }}<span v-if="!error && status !== 'pending'" class="ml-3 text-muted font-mono">{{
            posts.length
          }}</span>
        </p>
        <div
          class="ml-auto flex shrink-0 items-center gap-1"
          role="group"
          aria-label="文章显示方式"
        >
          <button
            type="button"
            class="icon-button"
            :class="{ 'control-selected': view === 'list' }"
            aria-label="列表显示"
            :aria-pressed="view === 'list'"
            @click="preference = 'list'"
          >
            <AppIcon name="list" />
          </button>
          <button
            type="button"
            class="icon-button"
            :class="{ 'control-selected': view === 'grid' }"
            aria-label="卡片显示"
            :aria-pressed="view === 'grid'"
            @click="preference = 'grid'"
          >
            <AppIcon name="grid" />
          </button>
        </div>
      </div>
      <div v-if="error" class="py-12" role="alert">
        <p>文章加载失败，请重试。</p>
        <BaseButton class="mt-4" variant="border" @click="refresh()">
          重新加载
        </BaseButton>
      </div>
      <p v-else-if="status === 'pending' && !data" class="py-12 text-muted" role="status">
        正在加载文章
      </p>
      <ContentEmptyState
        v-else-if="!posts.length"
        :title="filtered ? '没有符合条件的文章' : '暂无文章'"
        :description="filtered ? '请更改筛选条件或清除筛选。' : undefined"
      />
      <div v-else-if="view === 'grid'" class="grid gap-5 pt-6 md:grid-cols-2">
        <PostCard v-for="post in posts" :key="post.path" :post="post" />
      </div>
      <div v-else>
        <PostListItem v-for="post in posts" :key="post.path" :post="post" />
      </div>
    </div>
  </SiteColumns>
</template>
