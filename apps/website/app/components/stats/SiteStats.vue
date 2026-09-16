<script setup lang="ts">
import { contentCounts, statsNumber } from '#shared/stats/model'
import AppIcon from '../AppIcon.vue'

const catalog = usePostCatalog()
const stats = useVisitStats()
const mounted = ref(false)
const counts = computed(() => catalog.data.value && !catalog.error.value ? contentCounts(catalog.data.value) : null)
const items = computed(() => [
  { label: '文章', icon: 'notebook', value: counts.value?.articles },
  { label: '标签', icon: 'tags', value: counts.value?.tags },
  { label: '专栏', icon: 'folder', value: counts.value?.categories },
] as const)
const visits = computed(() => [
  { label: '累计浏览量', icon: 'eye', value: mounted.value ? stats.state.value.summary?.pageViews : undefined },
  { label: '累计访客数', icon: 'users', value: mounted.value ? stats.state.value.summary?.visitors : undefined },
] as const)
const contentStatus = computed(() => catalog.error.value ? '内容统计暂时不可用' : '内容统计加载中')
const visitFailed = computed(() => mounted.value && stats.state.value.errors.summary)
const visitStatus = computed(() => visitFailed.value ? '访问统计暂时不可用' : '访问统计加载中')
onMounted(() => {
  mounted.value = true
  void stats.loadSummary()
})
</script>

<template>
  <section class="hidden border border-line rounded-panel bg-surface p-4 lg:block" aria-labelledby="sidebar-stats">
    <h2 id="sidebar-stats" class="flex items-center gap-2.5 text-base text-heading font-semibold leading-6">
      <span class="h-4 w-0.75 shrink-0 rounded-sm bg-accent" aria-hidden="true" />
      网站统计
    </h2>
    <dl class="grid mb-0 mt-3 gap-1">
      <div v-for="item in items" :key="item.label" class="grid grid-cols-[1fr_minmax(0,1fr)] min-w-0 items-center gap-3 py-2">
        <dt class="flex items-center gap-2.5 text-xs text-muted">
          <AppIcon :name="item.icon" class="shrink-0 text-base text-accent-soft" />
          {{ item.label }}
        </dt>
        <dd class="m-0 min-w-0 break-all text-right text-base text-heading font-semibold leading-6 tabular-nums" :aria-label="item.value === undefined ? contentStatus : undefined">
          {{ statsNumber(item.value) }}
        </dd>
      </div>
    </dl>
    <dl v-if="stats.enabled" class="grid grid-cols-2 mb-0 mt-3 gap-2">
      <div v-for="item in visits" :key="item.label" class="min-w-0 rounded-xl bg-canvas/65 px-2.5 py-3 text-center">
        <dt class="flex flex-col items-center gap-1.5 text-xs text-muted leading-5">
          <AppIcon :name="item.icon" class="text-[18px] text-accent-soft" />
          {{ item.label }}
        </dt>
        <dd class="m-0 mt-1.5 min-h-6 break-all text-[18px] text-heading font-semibold leading-6 tabular-nums" :aria-label="item.value === undefined || visitFailed ? visitStatus : undefined">
          {{ visitFailed ? '—' : statsNumber(item.value) }}
        </dd>
      </div>
    </dl>
  </section>
</template>
