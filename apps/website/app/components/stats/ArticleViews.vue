<script setup lang="ts">
import { normalizeStatsPath, statsNumber } from '#shared/stats/model'
import AppIcon from '../AppIcon.vue'

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
  <span v-if="stats.enabled" class="min-w-24 inline-flex items-center gap-1.5 whitespace-nowrap tabular-nums" :aria-label="label"><AppIcon name="eye" /><span>浏览 {{ statsNumber(views) }} 次</span></span>
</template>
