import type { Ref } from 'vue'
import { usePreferredReducedMotion } from '@vueuse/core'
import { onBeforeUnmount, watch } from 'vue'

export function useSliderMotion(track: Ref<HTMLElement | null>) {
  const reduced = usePreferredReducedMotion()
  let disposed = false
  let animation: { kill: () => void } | undefined
  let engine: typeof import('gsap')['gsap'] | undefined
  let request = 0
  const clear = () => {
    request++
    animation?.kill()
    animation = undefined
    if (track.value) {
      track.value.style.transform = ''
      track.value.style.transformOrigin = ''
    }
  }
  function stretch(clientX: number, left: number, width: number) {
    clear()
    if (reduced.value === 'reduce' || !track.value || width <= 0)
      return
    const distance = clientX < left ? clientX - left : clientX > left + width ? clientX - left - width : 0
    const overflow = Math.min(8, Math.abs(distance) * 0.15)
    track.value.style.transformOrigin = distance < 0 ? 'right' : 'left'
    track.value.style.transform = `scaleX(${1 + overflow / width}) scaleY(${1 - overflow / 80})`
  }
  async function release() {
    const token = ++request
    if (reduced.value === 'reduce') {
      clear()
      return
    }
    try {
      engine ??= (await import('gsap')).gsap
    }
    catch {
      if (!disposed && token === request)
        clear()
      return
    }
    if (disposed || token !== request || !track.value)
      return
    animation?.kill()
    animation = engine.to(track.value, { scaleX: 1, scaleY: 1, duration: 0.22, ease: 'back.out(1.6)', clearProps: 'transform,transformOrigin' })
  }
  watch(reduced, clear)
  onBeforeUnmount(() => {
    disposed = true
    clear()
  })
  return { stretch, release, clear }
}
