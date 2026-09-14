import { usePreferredReducedMotion, useWindowScroll } from '@vueuse/core'
import { computed } from 'vue'

export function useScrollToTop() {
  const { y } = useWindowScroll()
  const preferredMotion = usePreferredReducedMotion()
  const isScrolled = computed(() => y.value > 0)

  function scrollToTop(): void {
    if (typeof window === 'undefined')
      return
    window.scrollTo({
      top: 0,
      behavior: preferredMotion.value === 'reduce' ? 'auto' : 'smooth',
    })
  }

  return { isScrolled, scrollToTop }
}
