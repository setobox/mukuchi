import type { Ref } from 'vue'
import type { ChartDomain, ChartPoint, PlotPoint } from './geometry'
import type { ChartMotion } from './motion'
import { onClickOutside, useDocumentVisibility, useElementSize, useElementVisibility, usePreferredReducedMotion } from '@vueuse/core'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { chartGeometry, chartScale, isWindowAppend, nearestPoint, normalizePoints, ordinate, samePoints, timeTicks } from './geometry'
import { startChartMotion } from './motion'

export interface TimeSeriesOptions {
  points: readonly ChartPoint[]
  mode: 'history' | 'live'
  domain: ChartDomain
  integerTicks: boolean
  windowSize: number
  duration: number
  active: boolean
}

export function useTimeSeries(props: TimeSeriesOptions, elements: {
  root: Ref<HTMLElement | null>
  plot: Ref<HTMLElement | null>
  track: Ref<HTMLElement | null>
  cursor: Ref<SVGElement | null>
  endpoint: Ref<HTMLElement | null>
}) {
  const { width: measuredWidth, height: measuredHeight } = useElementSize(elements.plot, { width: 600, height: 200 })
  const width = computed(() => Math.max(1, measuredWidth.value))
  const height = computed(() => Math.max(25, measuredHeight.value))
  const documentVisibility = useDocumentVisibility()
  const inViewport = useElementVisibility(elements.plot)
  const reducedMotion = usePreferredReducedMotion()
  const mounted = ref(false)
  const enabled = computed(() => mounted.value && props.active && inViewport.value && documentVisibility.value === 'visible' && reducedMotion.value !== 'reduce' && measuredWidth.value > 0)
  const data = computed(() => {
    const points = normalizePoints(props.points)
    return props.mode === 'live' ? points.slice(-Math.max(2, Math.floor(props.windowSize) || 60)) : points
  })
  const scale = computed(() => chartScale(data.value, props.domain, props.integerTicks))
  const segment = shallowRef<{ points: ChartPoint[], count: number } | null>(null)
  const geometry = computed(() => chartGeometry(segment.value?.points ?? data.value, width.value, height.value, scale.value, segment.value?.count ?? data.value.length))
  const ticks = computed(() => timeTicks(chartGeometry(data.value, width.value, height.value, scale.value).points, width.value))
  const selected = shallowRef<{ time: number, anchor: number } | null>(null)
  const interaction = ref<'pointer' | 'touch' | 'keyboard' | null>(null)
  const selectedPoint = computed(() => geometry.value.points.find(point => point.time === selected.value?.time && point.y !== null))
  const latest = computed(() => data.value.at(-1))
  const displayed = computed(() => selectedPoint.value ?? latest.value)
  const endpointY = computed(() => latest.value?.value == null ? 0 : ordinate(latest.value.value, height.value, scale.value))
  const endpointX = computed(() => data.value.length === 1 ? width.value / 2 : width.value)
  let motion: ChartMotion | undefined
  let revision = 0
  let disposed = false
  let frame: number | undefined
  let alternate = false
  let pointerClientX = 0
  let dragging = false

  const offset = () => motion ? motion.progress() * geometry.value.step : 0
  function stopFrame() {
    if (frame !== undefined)
      cancelAnimationFrame(frame)
    frame = undefined
  }
  function select(point: PlotPoint | undefined, screenX: number) {
    if (!point) {
      selected.value = null
      return
    }
    if (selected.value?.time !== point.time)
      selected.value = { time: point.time, anchor: Math.max(0, Math.min(width.value, screenX)) }
  }
  function locatePointer() {
    const rect = elements.plot.value?.getBoundingClientRect()
    if (!rect)
      return
    const x = Math.max(0, Math.min(width.value, pointerClientX - rect.left))
    const point = nearestPoint(geometry.value.points, x, offset(), width.value)
    select(point, point ? point.x - offset() : x)
  }
  function startFrame() {
    if (frame !== undefined || !motion || interaction.value !== 'pointer' || !enabled.value)
      return
    const tick = () => {
      frame = undefined
      if (!motion || interaction.value !== 'pointer' || !enabled.value)
        return
      alternate = !alternate
      if (alternate)
        locatePointer()
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
  }
  function cancelMotion() {
    revision++
    motion?.cancel()
    motion = undefined
    stopFrame()
  }
  function reconcileSelection() {
    if (interaction.value === 'pointer') {
      locatePointer()
    }
    else if (selected.value) {
      const point = geometry.value.points.find(point => point.time === selected.value!.time && point.y !== null)
      selected.value = point ? { time: point.time, anchor: Math.max(0, Math.min(width.value, point.x - offset())) } : null
    }
  }
  function settle() {
    cancelMotion()
    segment.value = null
    reconcileSelection()
  }
  async function play(progress = 0) {
    const token = revision
    await nextTick()
    if (disposed || token !== revision)
      return
    const current = segment.value
    const { track, cursor, endpoint } = elements
    if (!current || !enabled.value || !track.value?.animate || !cursor.value?.animate || !endpoint.value?.animate || progress >= 1) {
      settle()
      return
    }
    const previous = current.points[current.count - 1]!
    const next = current.points.at(-1)!
    try {
      motion = startChartMotion({ track: track.value, cursor: cursor.value, endpoint: endpoint.value, distance: geometry.value.step, fromY: ordinate(previous.value!, height.value, scale.value), toY: ordinate(next.value!, height.value, scale.value), duration: Math.max(1, props.duration), progress })
      reconcileSelection()
      startFrame()
      void motion.finished.then(() => {
        if (!disposed && token === revision)
          settle()
      }).catch(() => undefined)
    }
    catch { settle() }
  }
  watch(data, (next, previous) => {
    if (samePoints(next, previous))
      return
    const wasRolling = segment.value !== null
    const before = chartScale(previous, props.domain, props.integerTicks)
    const canRoll = !wasRolling && props.mode === 'live' && enabled.value && props.duration > 0 && isWindowAppend(previous, next)
      && previous.length === Math.max(2, Math.floor(props.windowSize) || 60)
      && before.min === scale.value.min && before.max === scale.value.max
      && previous.at(-1)?.value != null && next.at(-1)?.value != null
    settle()
    if (canRoll) {
      segment.value = { points: [...previous, next.at(-1)!], count: previous.length }
      void play()
    }
  })
  watch([width, height], () => {
    if (!segment.value) {
      reconcileSelection()
      return
    }
    const progress = motion?.progress() ?? 0
    cancelMotion()
    void play(progress)
  })
  watch([() => props.mode, () => typeof props.domain === 'string' ? props.domain : props.domain.join(':'), () => props.integerTicks, () => props.windowSize, () => props.duration], settle)
  watch(enabled, (value) => {
    if (!value) {
      interaction.value = null
      selected.value = null
      dragging = false
      settle()
    }
  })
  onMounted(() => mounted.value = true)
  onBeforeUnmount(() => {
    disposed = true
    cancelMotion()
  })

  function clear() {
    interaction.value = null
    selected.value = null
    dragging = false
    stopFrame()
  }
  onClickOutside(elements.root, () => {
    if (interaction.value === 'touch')
      clear()
  })
  function pointerMove(event: PointerEvent) {
    if (event.pointerType === 'touch' && !dragging)
      return
    interaction.value = event.pointerType === 'touch' ? 'touch' : 'pointer'
    pointerClientX = event.clientX
    locatePointer()
    startFrame()
  }
  function pointerDown(event: PointerEvent) {
    if (event.pointerType !== 'touch')
      return
    dragging = true
    elements.plot.value?.setPointerCapture?.(event.pointerId)
    pointerMove(event)
  }
  function pointerEnd() {
    dragging = false
  }
  function pointerLeave() {
    if (interaction.value === 'pointer')
      clear()
  }
  function keydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      clear()
      return
    }
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
      return
    event.preventDefault()
    interaction.value = 'keyboard'
    stopFrame()
    const visible = geometry.value.points.filter(point => point.y !== null && point.x - offset() >= -0.01 && point.x - offset() <= width.value + 0.01)
    const index = visible.findIndex(point => point.time === selected.value?.time)
    const initial = index < 0 ? visible.length - 1 : index
    const target = event.key === 'Home' ? 0 : event.key === 'End' ? visible.length - 1 : Math.max(0, Math.min(visible.length - 1, initial + (event.key === 'ArrowLeft' ? -1 : 1)))
    const point = visible[target]
    select(point, point ? point.x - offset() : 0)
  }
  return { width, height, scale, geometry, ticks, selected, selectedPoint, latest, displayed, interaction, endpointX, endpointY, enabled, rolling: computed(() => segment.value !== null), clear, pointerMove, pointerDown, pointerEnd, pointerLeave, keydown }
}
