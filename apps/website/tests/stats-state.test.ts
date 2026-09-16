import type { StatsSummary } from '../shared/stats/model'
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { ref } from 'vue'
import { useVisitStats } from '../app/composables/useVisitStats'

afterEach(() => vi.unstubAllGlobals())

test('较早完成写入但较晚返回的响应不会覆盖已获取的新计数', () => {
  const state = ref<{ summary: StatsSummary | null, pages: Record<string, number>, errors: Record<string, boolean> }>({ summary: null, pages: {}, errors: {} })
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { statsEnabled: true }, app: { baseURL: '/blog/' } }))
  vi.stubGlobal('useState', () => state)
  const stats = useVisitStats()
  stats.accept({ summary: { pageViews: 20, visitors: 4, startedAt: null }, page: { path: '/posts', pageViews: 12 } })
  stats.accept({ summary: { pageViews: 19, visitors: 3, startedAt: null }, page: { path: '/posts', pageViews: 11 } })
  expect(state.value.summary).toMatchObject({ pageViews: 20, visitors: 4 })
  expect(state.value.pages['/posts']).toBe(12)
  expect(stats.endpoint('summary')).toBe('/blog/api/stats/summary')
})
