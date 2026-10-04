// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { computed, createApp, h, nextTick, ref, watch } from 'vue'
import BaseTimeSeriesChart from '../app/components/base/BaseTimeSeriesChart.vue'
import StatsPage from '../app/pages/admin/stats.vue'

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup())
  vi.unstubAllGlobals()
})
const fixture = (page = 1) => ({ from: '2026-09-01', to: '2026-09-03', page, pageSize: 20, total: { pageViews: 1000, visitors: 500 }, summary: { pageViews: 50, visitors: 20 }, daily: [{ day: '2026-09-01', pageViews: 10, visitors: 5 }, { day: '2026-09-02', pageViews: 30, visitors: 10 }, { day: '2026-09-03', pageViews: 10, visitors: 5 }], pages: [{ path: `/posts/page-${page}`, pageViews: 5, visitors: 3 }], totalPages: 25 })
async function flush() {
  for (let i = 0; i < 8; i++) await nextTick()
}
async function mount() {
  const pending: { path: string, resolve: (data: ReturnType<typeof fixture>) => void, reject: (error: Error) => void }[] = []
  const request = vi.fn((path: string) => path === 'stats/settings' ? Promise.resolve({ enabled: true, version: 1 }) : new Promise<ReturnType<typeof fixture>>((resolve, reject) => pending.push({ path, resolve, reject })))
  for (const [name, value] of Object.entries({ computed, ref, watch, definePageMeta: vi.fn(), useSeoMeta: vi.fn(), useAdminSession: () => ({ current: ref({ user: { role: 'admin' } }), request }), adminError: (error: Error) => error.message })) vi.stubGlobal(name, value)
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp(StatsPage)
  app.component('BaseTimeSeriesChart', BaseTimeSeriesChart)
  app.component('BaseButton', { setup: (_, { slots }) => () => h('button', slots.default?.()) })
  app.component('AdminSkeleton', { render: () => h('div', '正在读取统计…') })
  app.mount(host)
  cleanups.push(() => {
    app.unmount()
    host.remove()
  })
  await flush()
  const query = () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  const next = () => [...host.querySelectorAll('button')].find(button => button.textContent?.includes('下一页'))!.click()
  const date = (value: string) => {
    const input = host.querySelector<HTMLInputElement>('input[type="date"]')!
    input.value = value
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }
  return { host, pending, query, next, date }
}

test('真实图表默认显示最后一天，PV 与 UV 独立选择，四项汇总与详细表格保留', async () => {
  const { host, pending } = await mount()
  pending[0]!.resolve(fixture())
  await flush()
  expect([...host.querySelectorAll('[data-chart-value]')].map(p => p.textContent)).toEqual(['10', '5'])
  expect([...host.querySelectorAll('[data-chart-time]')].map(p => p.textContent)).toEqual(['2026-09-03', '2026-09-03'])
  host.querySelector('[data-chart-plot]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
  await flush()
  expect([...host.querySelectorAll('[data-chart-value]')].map(p => p.textContent)).toEqual(['30', '5'])
  for (const label of ['累计浏览量', '累计访客', '区间浏览量', '区间访客', '查看每日数据', '页面排行']) expect(host.textContent).toContain(label)
  expect(host.querySelectorAll('details tbody tr')).toHaveLength(3)
})

test('翻页沿用已查询日期，失败保留上次结果和页码，新查询才使用编辑中的日期', async () => {
  const { host, pending, query, next, date } = await mount()
  pending[0]!.resolve(fixture())
  await flush()
  date('2026-08-01')
  next()
  await flush()
  expect(pending[1]!.path).toContain('from=2026-09-01')
  expect(pending[1]!.path).toContain('page=2')
  pending[1]!.reject(new Error('查询失败'))
  await flush()
  expect(host.textContent).toContain('第 1 页')
  expect(host.textContent).toContain('当前显示 2026-09-01 至 2026-09-03')
  expect(host.querySelector('[data-chart-value]')?.textContent).toBe('10')
  query()
  await flush()
  expect(pending[2]!.path).toContain('from=2026-08-01')
  expect(pending[2]!.path).toContain('page=1')
  pending[2]!.resolve({ ...fixture(), from: '2026-08-01' })
  await flush()
  expect(host.textContent).toContain('当前显示 2026-08-01')
})

test('旧查询迟到不能覆盖最新结果，首次查询失败不会生成零值图表', async () => {
  const { host, pending, query } = await mount()
  pending[0]!.reject(new Error('暂时不可用'))
  await flush()
  expect(host.querySelectorAll('[data-chart-plot]')).toHaveLength(0)
  query()
  await flush()
  query()
  await flush()
  pending[2]!.resolve(fixture())
  await flush()
  pending[1]!.resolve({ ...fixture(), daily: [{ day: '2026-09-03', pageViews: 999, visitors: 999 }] })
  await flush()
  expect(host.querySelector('[data-chart-value]')?.textContent).toBe('10')
})
