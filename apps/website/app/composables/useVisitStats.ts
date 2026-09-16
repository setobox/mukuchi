import type { RecordedStats, StatsSummary } from '#shared/stats/model'
import { normalizeStatsPath, pageStatsSchema, statsEnabled, summarySchema } from '#shared/stats/model'

interface VisitStatsState {
  summary: StatsSummary | null
  pages: Record<string, number>
  errors: Record<string, boolean>
}

export function useVisitStats() {
  const config = useRuntimeConfig()
  const enabled = statsEnabled(config.public.statsEnabled)
  const state = useState<VisitStatsState>('stats:visits', () => ({ summary: null, pages: {}, errors: {} }))
  const endpoint = (suffix: string) => `${config.app.baseURL}api/stats/${suffix}`
  function accept(result: RecordedStats) {
    if (!state.value.summary || result.summary.pageViews >= state.value.summary.pageViews)
      state.value.summary = result.summary
    state.value.pages[result.page.path] = Math.max(state.value.pages[result.page.path] ?? 0, result.page.pageViews)
    delete state.value.errors.summary
    delete state.value.errors[result.page.path]
  }
  function fail(path: string) {
    state.value.errors[path] = true
    state.value.errors.summary = true
  }
  async function loadPage(path: string) {
    if (!import.meta.client || !enabled)
      return
    const normalized = normalizeStatsPath(path)
    try {
      const result = pageStatsSchema.parse(await $fetch(endpoint('page'), { query: { path: normalized }, retry: 0 }))
      // GET may have started before a successful POST; never replace newer counters.
      state.value.pages[normalized] = Math.max(state.value.pages[normalized] ?? 0, result.pageViews)
      delete state.value.errors[normalized]
    }
    catch {
      state.value.errors[normalized] = true
    }
  }
  async function loadSummary() {
    if (!import.meta.client || !enabled)
      return
    try {
      const result = summarySchema.parse(await $fetch(endpoint('summary'), { retry: 0 }))
      if (!state.value.summary || result.pageViews >= state.value.summary.pageViews)
        state.value.summary = result
      delete state.value.errors.summary
    }
    catch {
      state.value.errors.summary = true
    }
  }
  return { enabled, state, endpoint, accept, fail, loadPage, loadSummary }
}
