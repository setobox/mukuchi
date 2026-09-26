<script setup lang="ts">
import type { TaxonomyFilter } from '#shared/content/taxonomy'
import { usePreferredReducedMotion } from '@vueuse/core'
import { computed, nextTick, onMounted, useTemplateRef, watch } from 'vue'
import { filterPosts } from '#shared/content/catalog'
import { paginatePosts } from '~/features/posts/pagination'

const props = defineProps<{ filter?: TaxonomyFilter }>()
const { data, tags, error, status, refresh } = usePostCatalog()
const tag = computed(() => props.filter?.kind === 'tag' ? props.filter.name : '')
const posts = computed(() =>
  filterPosts(data.value ?? [], props.filter),
)
const route = useRoute()
const router = useRouter()
const pagination = computed(() => paginatePosts(posts.value, route.query.page))
const listStart = useTemplateRef<HTMLElement>('listStart')
const preferredMotion = usePreferredReducedMotion()
const baseUrl = usePageUrl(() => route.path)
const canonical = computed(() => pagination.value.page > 1
  ? `${baseUrl.value}?page=${pagination.value.page}`
  : baseUrl.value)
useHead({ link: [{ key: 'canonical', rel: 'canonical', href: canonical }] })
useSeoMeta({ ogUrl: canonical })

function location(page: number) {
  const query = { ...route.query }
  if (page === 1)
    delete query.page
  else
    query.page = String(page)
  return { path: route.path, query }
}

// Wait for client hydration and a successful catalog before correcting the URL.
// An empty or pending catalog must not discard a directly requested later page.
onMounted(() => {
  watch([() => route.query.page, pagination, status, error], () => {
    if (status.value !== 'success' || error.value)
      return
    const target = location(pagination.value.page)
    if (route.query.page !== target.query.page)
      void router.replace({ ...target, hash: route.hash })
  }, { immediate: true })
})

async function focusList() {
  await nextTick()
  listStart.value?.focus({ preventScroll: true })
  listStart.value?.scrollIntoView({ block: 'start', behavior: preferredMotion.value === 'reduce' ? 'instant' : 'smooth' })
}
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
      <div ref="listStart" tabindex="-1" role="group" aria-label="文章列表" class="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
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
        <PostCard v-for="post in pagination.posts" :key="post.path" :post="post" />
      </div>
      <div v-else class="flex flex-col gap-4 pt-6">
        <PostListItem v-for="post in pagination.posts" :key="post.path" :post="post" />
      </div>
      <PostPagination
        v-if="!error && status === 'success'"
        :page="pagination.page"
        :page-count="pagination.pageCount"
        :location="location"
        @navigate="focusList"
      />
    </div>
  </SiteColumns>
</template>
