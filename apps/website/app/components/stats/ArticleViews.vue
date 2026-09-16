<script setup lang="ts">
import { normalizeStatsPath, statsNumber } from '#shared/stats/model'

const props = defineProps<{ path: string }>()
const stats = useVisitStats()
const mounted = ref(false)
const path = computed(() => normalizeStatsPath(props.path))
const failed = computed(() => mounted.value && stats.state.value.errors[path.value])
const views = computed(() => !mounted.value || failed.value ? undefined : stats.state.value.pages[path.value])
const label = computed(() => failed.value ? '浏览量暂时不可用' : views.value === undefined ? '浏览量加载中' : undefined)
onMounted(() => {
  mounted.value = true
  void stats.loadPage(props.path)
})
watch(() => props.path, (value) => {
  void stats.loadPage(value)
})
</script>

<template>
  <span v-if="stats.enabled" class="inline-block min-w-24 tabular-nums" :aria-label="label">浏览 {{ statsNumber(views) }} 次</span>
</template>
