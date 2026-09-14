import type { ComputedRef, Ref } from 'vue'
import type { TocLink } from './model'
import { activeHeading, flattenToc } from './model'

export function useArticleToc(links: ComputedRef<TocLink[]>, root: Ref<HTMLElement | null>) {
  const items = computed(() => flattenToc(links.value))
  const activeId = ref('')
  const { y } = useWindowScroll()
  const { width, height } = useWindowSize()
  let frame = 0
  function update() {
    if (!root.value)
      return
    const offset
      = Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0
    activeId.value = activeHeading(
      items.value.flatMap((item) => {
        const heading = document.getElementById(item.id)
        return heading && root.value?.contains(heading)
          ? [{ id: item.id, top: heading.getBoundingClientRect().top }]
          : []
      }),
      offset,
      y.value > 0
      && Math.ceil(y.value + window.innerHeight) >= document.documentElement.scrollHeight - 2,
    )
  }
  function schedule() {
    if (import.meta.server)
      return
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(update)
  }
  watch([y, width, height, items], schedule, { flush: 'post' })
  useResizeObserver(root, schedule)
  onMounted(schedule)
  onBeforeUnmount(() => cancelAnimationFrame(frame))
  return {
    items,
    activeId,
    currentTitle: computed(
      () => items.value.find(item => item.id === activeId.value)?.text ?? '文章目录',
    ),
  }
}
