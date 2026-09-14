<script setup lang="ts">
import { filterPosts, queryTerm } from "~~/shared/content/catalog";
const props = withDefaults(defineProps<{ category?: string }>(), { category: "" });
const route = useRoute();
const { data, tags, error, status, refresh } = usePostCatalog();
const tag = computed(() => queryTerm(route.query.tag));
const posts = computed(() =>
  filterPosts(data.value ?? [], { tag: tag.value, category: props.category }),
);
const preference = useCookie<string>("mukuchi:post-view", {
  default: () => "list",
  sameSite: "lax",
  maxAge: 31536000,
});
const view = computed(() => (preference.value === "grid" ? "grid" : "list"));
const filtered = computed(() => !!tag.value || !!props.category);
</script>
<template>
  <SiteColumns>
    <template #sidebar
      ><SiteSidebar :tags="tags" :selected-tag="tag" :filter-base="route.path" :category="category"
    /></template>
    <div>
      <div v-if="tags.length" class="mb-6 lg:hidden">
        <TagFilter :tags="tags" :selected="tag" :base="route.path" :category="category" />
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
            :class="{ 'bg-surface text-heading': view === 'list' }"
            aria-label="列表显示"
            :aria-pressed="view === 'list'"
            @click="preference = 'list'"
          >
            <AppIcon name="list" />
          </button>
          <button
            type="button"
            class="icon-button"
            :class="{ 'bg-surface text-heading': view === 'grid' }"
            aria-label="卡片显示"
            :aria-pressed="view === 'grid'"
            @click="preference = 'grid'"
          >
            <AppIcon name="grid" />
          </button>
        </div>
      </div>
      <!-- 暂不需要 -->
      <!-- <div v-if="filtered" class="flex flex-wrap items-center gap-3 pt-4 text-sm text-muted">
        <span v-if="category">专栏：{{ category }}</span
        ><span v-if="tag">标签：{{ tag }}</span>
        <NuxtLink :to="route.path" class="min-h-9 inline-flex items-center text-accent-soft"
        >清除筛选<AppIcon name="close"
        /></NuxtLink>
      </div> -->
      <div v-if="error" class="py-12" role="alert">
        <p>文章加载失败，请重试。</p>
        <BaseButton class="mt-4" variant="border" @click="refresh()">重新加载</BaseButton>
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
      <div v-else><PostListItem v-for="post in posts" :key="post.path" :post="post" /></div>
    </div>
  </SiteColumns>
</template>
