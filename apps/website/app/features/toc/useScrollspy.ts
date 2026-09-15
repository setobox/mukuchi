// Adapted from Nuxt UI v4.6.0 useScrollspy (MIT); see THIRD_PARTY_NOTICES.md.
import type { MaybeRefOrGetter } from 'vue'
import { onMounted, onScopeDispose, ref, toValue, watch } from 'vue'

export function useScrollspy(ids: MaybeRefOrGetter<readonly string[]>) {
  const activeHeadings = ref<string[]>([])
  let observer: IntersectionObserver | undefined
  let mounted = false
  let generation = 0

  function refresh() {
    if (!mounted)
      return
    observer?.disconnect()
    activeHeadings.value = []
    const currentGeneration = ++generation
    const headings = [...new Set(toValue(ids))]
      .map(id => document.getElementById(id))
      .filter((heading): heading is HTMLElement => heading !== null)
    const visible = new Set<string>()
    if (!headings.length || typeof IntersectionObserver === 'undefined')
      return

    observer = new IntersectionObserver((entries) => {
      if (generation !== currentGeneration)
        return
      for (const entry of entries) {
        if (entry.isIntersecting)
          visible.add(entry.target.id)
        else
          visible.delete(entry.target.id)
      }
      const next = headings.filter(heading => visible.has(heading.id)).map(heading => heading.id)
      // Match upstream: retain the last visible group between sections.
      if (next.length)
        activeHeadings.value = next
    })
    headings.forEach(heading => observer?.observe(heading))
  }

  watch(() => toValue(ids), refresh, { flush: 'post' })
  onMounted(() => {
    mounted = true
    refresh()
  })
  onScopeDispose(() => {
    mounted = false
    generation++
    observer?.disconnect()
  })
  return { activeHeadings, refresh }
}
