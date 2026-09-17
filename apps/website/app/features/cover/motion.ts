import type { Ref } from 'vue'
import { usePreferredReducedMotion } from '@vueuse/core'
import { onBeforeUnmount, onMounted, watch } from 'vue'

export function useCoverMotion(root: Ref<HTMLElement | null>) {
  const reduced = usePreferredReducedMotion()
  let disposed = false
  let revert: (() => void) | undefined
  let stop: (() => void) | undefined
  let play = (_target: 'panel' | 'preview' | 'feedback') => {}
  onMounted(async () => {
    const { gsap } = await import('gsap')
    if (disposed || !root.value)
      return
    const context = gsap.context(() => {}, root.value)
    const clear = () => {
      const targets = root.value?.querySelectorAll('[data-cover-motion]') ?? []
      gsap.killTweensOf(targets)
      gsap.set(targets, { clearProps: 'opacity,transform' })
    }
    revert = () => context.revert()
    play = (target) => {
      if (reduced.value === 'reduce')
        return
      const node = root.value?.querySelector(`[data-cover-motion="${target}"]`)
      if (!node)
        return
      context.add(() => {
        gsap.killTweensOf(node)
        gsap.fromTo(node, { opacity: target === 'preview' ? 0.65 : 0, y: target === 'panel' ? 5 : 0 }, { opacity: 1, y: 0, duration: target === 'panel' ? 0.2 : 0.16, ease: 'power2.out', clearProps: 'opacity,transform' })
      })
    }
    stop = watch(reduced, clear)
  })
  onBeforeUnmount(() => {
    disposed = true
    stop?.()
    revert?.()
  })
  return { play: (target: 'panel' | 'preview' | 'feedback') => play(target) }
}
