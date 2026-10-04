<script setup lang="ts">
import { useIntervalFn } from '@vueuse/core'
import { computed, ref } from 'vue'
import BaseButton from '../../app/components/base/BaseButton.vue'
import BaseTimeSeriesChart from '../../app/components/base/BaseTimeSeriesChart.vue'

// Local visual fixture: temporarily mount in a development page; never collects metrics.
const start = Date.parse('2026-09-01T00:00:00+08:00')
const values = [22, 38, 26, 64, 43, 48, 36, 52, 79, 65, 72, 45, 55, 32, 48, 60]
const history = values.map((value, i) => ({ time: start + i * 86400000, value: value * 12 }))
const live = ref(values.map((value, i) => ({ time: start + i * 2000, value })))
const compact = ref(false)
const active = ref(true)
const count = ref(0)
function append() {
  count.value++
  live.value = [...live.value.slice(1), { time: live.value.at(-1)!.time + 2000, value: values[count.value % values.length]! }]
}
const { pause, resume, isActive } = useIntervalFn(append, 2000, { immediate: false })
const day = (time: number) => new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit' }).format(time)
const gaps = computed(() => history.map((point, i) => ({ ...point, value: i === 5 || i === 6 ? null : point.value })))
</script>

<template>
  <main class="mx-auto max-w-6xl p-6">
    <h1 class="text-page text-heading">
      图表视觉验收 · 本地模拟数据
    </h1>
    <div class="my-5 flex flex-wrap gap-3">
      <BaseButton @click="isActive ? pause() : resume()">
        {{ isActive ? '暂停采样' : '开始实时采样' }}
      </BaseButton>
      <BaseButton variant="border" @click="append">
        追加一个采样
      </BaseButton>
      <BaseButton variant="border" @click="compact = !compact">
        切换容器宽度
      </BaseButton>
      <BaseButton variant="border" @click="active = !active">
        {{ active ? '停止动效' : '恢复动效' }}
      </BaseButton>
      <p>已追加 {{ count }} 个采样</p>
    </div>
    <div :class="compact ? 'max-w-md' : ''" class="grid gap-4 md:grid-cols-2">
      <BaseTimeSeriesChart title="历史浏览量" :points="history" integer-ticks :format-time="day" :format-tick="day" />
      <BaseTimeSeriesChart title="模拟实时占用率" :points="live" mode="live" :window-size="16" :domain="[0, 100]" :active="active" color="var(--color-info)" :format-value="value => `${value}%`" />
      <BaseTimeSeriesChart title="零值" :points="history.map(p => ({ ...p, value: 0 }))" integer-ticks :format-time="day" :format-tick="day" />
      <BaseTimeSeriesChart title="缺失采样" :points="gaps" :format-time="day" :format-tick="day" />
      <BaseTimeSeriesChart title="单个采样" :points="[history[0]!]" :format-time="day" :format-tick="day" />
      <BaseTimeSeriesChart title="大数" :points="history.map(p => ({ ...p, value: p.value * 1e10 }))" :format-time="day" :format-tick="day" />
    </div>
  </main>
</template>
