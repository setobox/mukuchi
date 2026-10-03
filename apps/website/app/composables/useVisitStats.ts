import type { RecordedStats, StatsSummary } from '#shared/stats/model'
import { normalizeStatsPath, pageStatsSchema, summarySchema } from '#shared/stats/model'

interface VisitStatsState {
  summary: StatsSummary | null
  pages: Record<string, number>
  errors: Record<string, boolean>
}

export function useVisitStats() {
  const config = useRuntimeConfig()
  const endpoint = (suffix: string) => `${config.app.baseURL}api/stats/${suffix}`
  const availability = useState<boolean | null>('stats:enabled', () => null)
  async function refreshSettings() {
    try {
      availability.value = (await $fetch<{ enabled: boolean }>(endpoint('settings'), { retry: 0 })).enabled === true
    }
    catch { availability.value = false }
    return availability.value
  }
  const state = useState<VisitStatsState>('stats:visits', () => ({ summary: null, pages: {}, errors: {} }))
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
    if (!import.meta.client || !await refreshSettings())
      return
    const normalized = normalizeStatsPath(path)
    try {
      const result = pageStatsSchema.parse(await $fetch(endpoint('page'), { query: { path: normalized }, retry: 0 }))
      // GET may have started before a successful POST;
      // Never replace newer counters.
      state.value.pages[normalized] = Math.max(state.value.pages[normalized] ?? 0, result.pageViews)
      delete state.value.errors[normalized]
    }
    catch {
      state.value.errors[normalized] = true
    }
  }
  async function loadSummary() {
    if (!import.meta.client || !await refreshSettings())
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
  return { get enabled() {
    return availability.value === true
  }, refreshSettings, state, endpoint, accept, fail, loadPage, loadSummary }
}
