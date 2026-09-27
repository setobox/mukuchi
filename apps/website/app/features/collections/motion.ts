import type { Ref } from 'vue'
import { useEventListener, usePreferredReducedMotion } from '@vueuse/core'
import { onBeforeUnmount, onMounted, watch } from 'vue'

export function useResourceMotion(root: Ref<HTMLElement | null>) {
  const reduced = usePreferredReducedMotion()
  let disposed = false
  let hovered: HTMLElement | null = null
  let focused: HTMLElement | null = null
  let animate = (_card: HTMLElement, _active: boolean) => {}
  let revert = () => {}
  let stopReduced = () => {}

  function cardFor(target: EventTarget | null): HTMLElement | null {
    const card = target instanceof Element ? target.closest<HTMLElement>('[data-resource-link]') : null
    return card && root.value?.contains(card) ? card : null
  }
  function update(previous: HTMLElement | null, next: HTMLElement | null) {
    if (previous && previous !== next)
      animate(previous, previous === hovered || previous === focused)
    if (next)
      animate(next, true)
  }
  function pointer(event: PointerEvent) {
    if (event.pointerType === 'touch')
      return
    const next = cardFor(event.type === 'pointerout' ? event.relatedTarget : event.target)
    if (hovered === next)
      return
    const previous = hovered
    hovered = next
    update(previous, next)
  }
  function focus(event: FocusEvent) {
    const next = cardFor(event.type === 'focusout' ? event.relatedTarget : event.target)
    const previous = focused
    focused = next
    update(previous, next)
  }
  useEventListener(root, 'pointerover', pointer)
  useEventListener(root, 'pointerout', pointer)
  useEventListener(root, 'focusin', focus)
  useEventListener(root, 'focusout', focus)

  onMounted(async () => {
    const { gsap } = await import('gsap')
    if (disposed || !root.value)
      return
    const context = gsap.context(() => {}, root.value)
    revert = () => context.revert()
    animate = (card, active) => {
      if (reduced.value === 'reduce')
        return
      context.add(() => {
        const options = { duration: active ? 0.28 : 0.35, ease: 'power3.out', overwrite: true, ...(!active && { clearProps: 'transform' }) }
        gsap.to(card.querySelector('[data-resource-icon]'), { ...options, scale: active ? 1.08 : 1, rotation: active ? -4 : 0 })
        gsap.to(card.querySelector('[data-resource-body]'), { ...options, x: active ? 3 : 0 })
        gsap.to(card.querySelector('[data-resource-arrow]'), { ...options, x: active ? 2 : 0, y: active ? -2 : 0 })
      })
    }
    stopReduced = watch(reduced, () => {
      context.revert()
    })
  })

  onBeforeUnmount(() => {
    disposed = true
    stopReduced()
    revert()
  })
}
