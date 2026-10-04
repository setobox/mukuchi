<script setup lang="ts">
import type { ChartDomain, ChartPoint } from '~/features/charts/geometry'
import { computed, useId, useTemplateRef } from 'vue'
import { ordinate } from '~/features/charts/geometry'
import { useTimeSeries } from '~/features/charts/useTimeSeries'

const props = withDefaults(defineProps<{
  title: string
  points: readonly ChartPoint[]
  mode?: 'history' | 'live'
  domain?: ChartDomain
  integerTicks?: boolean
  color?: string
  windowSize?: number
  duration?: number
  active?: boolean
  formatValue?: (value: number) => string
  formatTime?: (time: number) => string
  formatTick?: (time: number) => string
}>(), { mode: 'history', domain: 'zero', integerTicks: false, color: 'var(--color-accent-text)', windowSize: 60, duration: 1000, active: true })
const id = useId()
const root = useTemplateRef<HTMLElement>('root')
const plot = useTemplateRef<HTMLElement>('plot')
const track = useTemplateRef<HTMLElement>('track')
const cursor = useTemplateRef<SVGElement>('cursor')
const endpoint = useTemplateRef<HTMLElement>('endpoint')
const chart = useTimeSeries(props, { root, plot, track, cursor, endpoint })
const { width, height, geometry, scale, ticks, selected, selectedPoint, latest, displayed, interaction, endpointX, endpointY, enabled, rolling } = chart
const numberFormatter = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 })
const axisFormatter = new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 2 })
const axisWidthLabel = computed(() => scale.value.ticks.map(value => axisFormatter.format(value)).sort((a, b) => b.length - a.length)[0])
const dateFormatter = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
const valueText = computed(() => displayed.value?.value == null ? '—' : (props.formatValue ?? (value => numberFormatter.format(value)))(displayed.value.value))
const timeText = (time: number) => (props.formatTime ?? (value => dateFormatter.format(value)))(time)
const tickText = (time: number) => (props.formatTick ?? timeText)(time)
const empty = computed(() => !geometry.value.points.some(point => point.y !== null))
const labelWidth = computed(() => Math.min(width.value, Math.max(64, valueText.value.length * 8 + 24)))
const labelX = computed(() => Math.max(0, Math.min(width.value - labelWidth.value, (selected.value?.anchor ?? 0) - labelWidth.value / 2)))
const chartWidth = computed(() => width.value + (rolling.value ? geometry.value.step : 0))
</script>

<template>
  <section ref="root" :aria-labelledby="`${id}-title`" class="min-w-0 border border-line rounded-panel bg-canvas p-5" :style="{ '--chart-color': color }">
    <div class="flex items-center justify-between gap-3">
      <h3 :id="`${id}-title`" class="flex items-center gap-2 text-sm text-muted font-medium">
        <span class="size-2 rounded-full bg-[var(--chart-color)]" aria-hidden="true" />{{ title }}
      </h3>
      <span v-if="mode === 'live'" class="text-xs text-muted">实时</span>
    </div>
    <div class="mt-3 min-h-18" :aria-live="interaction === 'keyboard' ? 'polite' : 'off'" aria-atomic="true">
      <p data-chart-value class="break-all text-heading font-semibold tabular-nums" :class="valueText.length > 16 ? 'text-title' : valueText.length > 12 ? 'text-section' : 'text-page'">
        {{ valueText }}
      </p>
      <p data-chart-time class="mt-1 text-xs text-muted">
        {{ displayed ? timeText(displayed.time) : '暂无数据' }}
      </p>
    </div>
    <p :id="`${id}-help`" class="sr-only">
      悬停或触摸查看真实采样值，使用左右方向键、Home 和 End 选择采样，Esc 清除选择。
    </p>
    <div class="grid grid-cols-[max-content_minmax(0,1fr)] mt-5 gap-x-3">
      <div class="relative min-w-7 text-right text-[10px] text-muted tabular-nums" aria-hidden="true">
        <span v-for="tick in scale.ticks" :key="tick" class="absolute right-0 whitespace-nowrap -translate-y-1/2" :style="{ top: `${ordinate(tick, height, scale) / height * 100}%` }">{{ axisFormatter.format(tick) }}</span>
        <span class="invisible">{{ axisWidthLabel }}</span>
      </div>
      <div ref="plot" data-chart-plot tabindex="0" role="group" :aria-label="`${title}趋势`" :aria-describedby="`${id}-help`" class="relative h-50 min-w-0 touch-pan-y rounded focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-4 focus-visible:outline" @pointermove="chart.pointerMove" @pointerdown="chart.pointerDown" @pointerup="chart.pointerEnd" @pointercancel="chart.pointerEnd" @pointerleave="chart.pointerLeave" @keydown="chart.keydown" @blur="chart.clear">
        <div class="pointer-events-none absolute inset-0" aria-hidden="true">
          <div v-for="tick in scale.ticks" :key="tick" class="absolute w-full border-t border-line border-dashed" :style="{ top: `${ordinate(tick, height, scale) / height * 100}%` }" />
        </div>
        <div class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          <div ref="track" data-chart-track :style="{ width: `${chartWidth}px`, height: `${height}px` }">
            <svg :width="chartWidth" :height="height" :viewBox="`0 0 ${chartWidth} ${height}`" class="block overflow-visible">
              <defs>
                <linearGradient :id="`${id}-fill`" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="var(--chart-color)" stop-opacity="0.24" /><stop offset="100%" stop-color="var(--chart-color)" stop-opacity="0.015" />
                </linearGradient>
                <filter :id="`${id}-glow`" filterUnits="userSpaceOnUse" x="-8" y="-8" :width="chartWidth + 16" :height="height + 16">
                  <feDropShadow dx="0" dy="0" stdDeviation="2" flood-color="var(--chart-color)" flood-opacity="0.32" />
                </filter>
              </defs>
              <path data-chart-area :d="geometry.area" :fill="`url(#${id}-fill)`" />
              <path data-chart-line :d="geometry.line" fill="none" stroke="var(--chart-color)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" :filter="`url(#${id}-glow)`" />
              <circle v-for="point in geometry.isolated" :key="point.time" :cx="point.x" :cy="point.y!" r="3" fill="var(--chart-color)" />
            </svg>
          </div>
        </div>
        <div ref="endpoint" data-chart-endpoint class="pointer-events-none absolute top-0" :style="{ left: `${endpointX}px`, transform: `translateY(${endpointY}px)`, visibility: latest?.value == null ? 'hidden' : 'visible' }" aria-hidden="true">
          <span v-if="mode === 'live' && enabled" class="absolute size-4 animate-pulse rounded-full bg-[var(--chart-color)] opacity-20 -translate-x-1/2 -translate-y-1/2 motion-reduce:animate-none" />
          <span class="absolute size-2 border-2 border-canvas rounded-full bg-[var(--chart-color)] -translate-x-1/2 -translate-y-1/2" />
        </div>
        <svg class="pointer-events-none absolute inset-0 h-full w-full overflow-hidden" :viewBox="`0 0 ${width} ${height}`" aria-hidden="true">
          <g ref="cursor" data-chart-cursor :visibility="selectedPoint ? 'visible' : 'hidden'">
            <line :x1="selectedPoint?.x ?? 0" :x2="selectedPoint?.x ?? 0" y1="12" :y2="height - 12" stroke="var(--color-muted)" stroke-width="1" stroke-dasharray="3 4" />
            <circle :cx="selectedPoint?.x ?? 0" :cy="selectedPoint?.y ?? 0" r="4" fill="var(--color-canvas)" stroke="var(--chart-color)" stroke-width="2" />
          </g>
          <g v-if="selectedPoint" data-chart-label :transform="`translate(${labelX}, 0)`">
            <rect :width="labelWidth" height="26" rx="13" fill="var(--color-surface)" stroke="var(--color-border-strong)" />
            <text :x="labelWidth / 2" y="17" text-anchor="middle" fill="var(--color-heading)" font-size="12" class="tabular-nums">{{ valueText }}</text>
          </g>
        </svg>
        <p v-if="empty" class="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted">
          暂无有效采样数据
        </p>
      </div>
      <div />
      <div class="relative mt-2 h-5 text-[10px] text-muted tabular-nums" aria-hidden="true">
        <span v-for="(tick, index) in ticks" :key="tick.time" class="absolute whitespace-nowrap" :style="{ left: `${tick.x / width * 100}%`, transform: ticks.length === 1 ? 'translateX(-50%)' : index === 0 ? 'none' : index === ticks.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)' }">{{ tickText(tick.time) }}</span>
      </div>
    </div>
  </section>
</template>
