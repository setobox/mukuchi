import { usePreferredReducedMotion } from '@vueuse/core'
import { onScopeDispose, watch } from 'vue'

export function useAssistantMotion() {
  const reduced = usePreferredReducedMotion()
  const reduceMotion = () => reduced.value === 'reduce'
  let disposed = false
  let context: ReturnType<typeof import('gsap')['gsap']['context']> | undefined
  const pending = new Set<HTMLElement>()
  const preparing = new Set<HTMLElement>()
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
    for (const root of preparing) root.classList.remove('assistant-preparing')
    preparing.clear()
    pending.clear()
    context?.revert()
    context = undefined
  }
  let revision = 0
  async function scene(root: HTMLElement, empty: boolean) {
    reset()
    const version = ++revision
    if (reduceMotion() || disposed)
      return
    preparing.add(root)
    root.classList.add('assistant-preparing')
    try {
      const { gsap } = await import('gsap')
      if (disposed || version !== revision || !root.isConnected || reduceMotion())
        return
      context = gsap.context(() => {
        root.classList.remove('assistant-preparing')
        preparing.delete(root)
        const timeline = gsap.timeline({ defaults: { duration: 0.24, ease: 'power2.out', clearProps: 'opacity,transform' } })
        const greeting = root.querySelector('.assistant-greeting')
        if (empty && greeting)
          timeline.fromTo(greeting, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.28 })
        timeline.fromTo(root.querySelectorAll('.assistant-scene-ui'), { opacity: 0 }, { opacity: 1 })
        const visible = [...root.querySelectorAll<HTMLElement>('.assistant-user, .assistant-reply')].filter((element) => {
          const box = element.getBoundingClientRect()
          return box.bottom >= 0 && box.top < window.innerHeight
        })
        for (const [index, element] of visible.entries())
          timeline.fromTo(element, { opacity: 0, x: element.classList.contains('assistant-user') ? 24 : -24 }, { opacity: 1, x: 0 }, index ? '<0.06' : '>')
        timeline.fromTo(root.querySelectorAll('.assistant-suggestion'), { opacity: 0, x: -8 }, { opacity: 1, x: 0, stagger: 0.04 }, '>')
      }, root)
    }
    catch { reset() }
  }
  onScopeDispose(() => {
    disposed = true
    reset()
  })
  watch(reduced, () => {
    if (reduceMotion())
      reset()
  })
  return { enter, scene, reset: () => {
    revision++
    reset()
  } }
}
