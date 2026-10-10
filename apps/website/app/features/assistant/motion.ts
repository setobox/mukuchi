import { usePreferredReducedMotion } from '@vueuse/core'
import { onScopeDispose, watch } from 'vue'

export function useAssistantMotion() {
  const reduced = usePreferredReducedMotion()
  const reduceMotion = () => reduced.value === 'reduce'
  let disposed = false
  let context: ReturnType<typeof import('gsap')['gsap']['context']> | undefined
  const pending = new Set<HTMLElement>()
  async function enter(element: Element, done: () => void = () => {}, delay = 0) {
    if (!(element instanceof HTMLElement) || reduceMotion() || disposed) {
      done()
      return
    }
    pending.add(element)
    try {
      const { gsap } = await import('gsap')
      if (disposed || !element.isConnected || !pending.has(element) || reduceMotion()) {
        done()
        return
      }
      context ??= gsap.context(() => {})
      context.add(() => {
        gsap.fromTo(element, { opacity: 0, y: 6 }, { opacity: 1, y: 0, delay, duration: 0.22, ease: 'power2.out', clearProps: 'opacity,transform', onComplete: done })
      })
    }
    catch {
      done()
    }
    finally { pending.delete(element) }
  }
  function reset() {
    pending.clear()
    context?.revert()
    context = undefined
  }
  onScopeDispose(() => {
    disposed = true
    reset()
  })
  watch(reduced, () => {
    if (reduceMotion())
      reset()
  })
  return { enter, reset }
}
