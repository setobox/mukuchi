import type { Ref } from 'vue'
import type { Point, Size } from './geometry'
import { useElementSize, useEventListener } from '@vueuse/core'
import { computed, onScopeDispose, ref, watch } from 'vue'
import { constrainTransform, fitImage, initialTransform, pinchImage, zoomImage } from './geometry'

export function useImageGestures(stage: Ref<HTMLElement | null>, natural: Ref<Size>, enabled: Ref<boolean>) {
  const { width, height } = useElementSize(stage)
  const viewport = computed(() => ({ width: width.value, height: height.value }))
  const fitted = computed(() => fitImage(natural.value, viewport.value))
  const transform = ref(initialTransform())
  const dragging = ref(false)
  const pointers = new Map<number, Point>()

  function clearPointers() {
    for (const id of pointers.keys()) {
      if (stage.value?.hasPointerCapture(id))
        stage.value.releasePointerCapture(id)
    }
    pointers.clear()
    dragging.value = false
  }
  function reset() {
    clearPointers()
    transform.value = initialTransform()
  }
  function position(event: PointerEvent | WheelEvent): Point {
    const rect = stage.value!.getBoundingClientRect()
    return { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 }
  }
  function zoom(target: number, origin: Point = { x: 0, y: 0 }) {
    if (enabled.value)
      transform.value = zoomImage(transform.value, target, origin, fitted.value, viewport.value)
  }
  function pan(x: number, y: number) {
    transform.value = constrainTransform({ ...transform.value, x: transform.value.x + x, y: transform.value.y + y }, fitted.value, viewport.value)
  }
  function pointerDown(event: PointerEvent) {
    if (!enabled.value || event.button !== 0)
      return
    stage.value?.setPointerCapture(event.pointerId)
    pointers.set(event.pointerId, position(event))
    dragging.value = true
  }
  function pointerMove(event: PointerEvent) {
    const previous = pointers.get(event.pointerId)
    if (!previous || !enabled.value)
      return
    const before = [...pointers.values()]
    const next = position(event)
    pointers.set(event.pointerId, next)
    if (before.length === 1) {
      pan(next.x - previous.x, next.y - previous.y)
    }
    else if (before.length === 2) {
      const after = [...pointers.values()]
      transform.value = pinchImage(transform.value, [before[0]!, before[1]!], [after[0]!, after[1]!], fitted.value, viewport.value)
    }
  }
  function pointerEnd(event: PointerEvent) {
    pointers.delete(event.pointerId)
    dragging.value = pointers.size > 0
    if (stage.value?.hasPointerCapture(event.pointerId))
      stage.value.releasePointerCapture(event.pointerId)
  }
  function wheel(event: WheelEvent) {
    if (!enabled.value)
      return
    event.preventDefault()
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height.value : 1)
    zoom(transform.value.scale * Math.exp(-delta * 0.002), position(event))
  }
  function keydown(event: KeyboardEvent) {
    if (!enabled.value || event.ctrlKey || event.metaKey || event.altKey)
      return
    const moves: Record<string, Point> = { ArrowLeft: { x: 40, y: 0 }, ArrowRight: { x: -40, y: 0 }, ArrowUp: { x: 0, y: 40 }, ArrowDown: { x: 0, y: -40 } }
    if (event.key === '+' || event.key === '=')
      zoom(transform.value.scale + 0.25)
    else if (event.key === '-')
      zoom(transform.value.scale - 0.25)
    else if (event.key === '0')
      reset()
    else if (moves[event.key])
      pan(moves[event.key]!.x, moves[event.key]!.y)
    else
      return
    event.preventDefault()
  }
  useEventListener(stage, 'pointerdown', pointerDown)
  useEventListener(stage, 'pointermove', pointerMove)
  useEventListener(stage, ['pointerup', 'pointercancel', 'lostpointercapture'], pointerEnd)
  useEventListener(stage, 'wheel', wheel, { passive: false })
  watch([width, height, natural, enabled], reset)
  onScopeDispose(clearPointers)
  return { transform, fitted, dragging, zoom, reset, keydown }
}
