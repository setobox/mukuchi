import { expect, test } from 'vite-plus/test'
import { chartGeometry, chartScale, isWindowAppend, nearestPoint, normalizePoints, timeTicks } from '../app/features/charts/geometry'

const points = (values: (number | null)[]) => values.map((value, time) => ({ time, value }))

test('采样按时间排序、重复时间取最新值，缺失和非法数值不伪装为零', () => {
  expect(normalizePoints([{ time: 2, value: 3 }, { time: 1, value: 0 }, { time: 2, value: 7 }, { time: 3, value: NaN }, { time: NaN, value: 4 }])).toEqual([{ time: 1, value: 0 }, { time: 2, value: 7 }, { time: 3, value: null }])
})

test('中点控制的贝塞尔与闭合面积共用同一条曲线，断点不跨越连接', () => {
  const data = points([0, 100, null, 50])
  const chart = chartGeometry(data, 300, 124, chartScale(data, [0, 100]))
  expect(chart.line).toBe('M0,112 C50,112 50,12 100,12 M300,62')
  expect(chart.area.trim()).toBe('M0,112 C50,112 50,12 100,12 L100,112 L0,112 Z')
  expect(chart.isolated).toEqual([{ time: 3, value: 50, x: 300, y: 62 }])
})

test('空数据、零值、单点、常量、负值和大数均有有限坐标；整数刻度不出现小数', () => {
  for (const values of [[], [null, null], [0, 0], [4], [5, 5], [-8, 12], [9e15, 1e15]] as (number | null)[][]) {
    for (const domain of ['zero', 'fit'] as const) {
      const data = points(values)
      const scale = chartScale(data, domain, true)
      const chart = chartGeometry(data, 400, 200, scale)
      expect(scale.max).toBeGreaterThan(scale.min)
      expect(scale.ticks.every(Number.isInteger)).toBe(true)
      expect(chart.line).not.toMatch(/NaN|Infinity/)
      expect(chart.area).not.toMatch(/NaN|Infinity/)
    }
  }
  expect(chartGeometry(points([4]), 400, 200, chartScale(points([4]))).points[0]!.x).toBe(200)
  expect(chartGeometry(points([null]), 400, 200, chartScale([])).line).toBe('')
  expect(chartGeometry(points([0, 0]), 400, 200, chartScale(points([0, 0]))).line).toContain('C')
})

test('zero 包含零，fit 留出边距，固定范围钳制越界采样', () => {
  expect(chartScale(points([65, 75]), 'zero').min).toBe(0)
  const fit = chartScale(points([65, 75]), 'fit')
  expect(fit.min).toBeGreaterThan(0)
  expect(fit.min).toBeLessThan(65)
  expect(fit.max).toBeGreaterThan(75)
  const fixed = chartScale(points([-10, 200]), [0, 100])
  expect(fixed.ticks).toEqual([0, 25, 50, 75, 100])
  expect(chartGeometry(points([-10, 200]), 400, 124, fixed).points.map(p => p.y)).toEqual([112, 12])
  expect(chartScale(points([1, 3]), [0, 3], true).ticks).toEqual([0, 1, 2, 3])
  const signed = chartGeometry(points([-10, 10]), 400, 124, chartScale(points([-10, 10]), [-10, 10]))
  expect(signed.area).toContain('L400,112 L0,112 Z')
})

test('仅识别相同窗口内单点追加，批次、修订与重复数据不会滚动', () => {
  const old = points([10, 20, 30])
  const append = [...old.slice(1), { time: 3, value: 40 }]
  expect(isWindowAppend(old, append)).toBe(true)
  expect(isWindowAppend(old, old)).toBe(false)
  expect(isWindowAppend(old, [...old, { time: 3, value: 40 }])).toBe(false)
  expect(isWindowAppend(old, points([10, 25, 30]))).toBe(false)
  expect(isWindowAppend(old, [{ time: 2, value: 30 }, { time: 3, value: 40 }, { time: 4, value: 50 }])).toBe(false)
})

test('平移窗口保留 N+1 点，悬停只选可见的真实采样，刻度保留两端', () => {
  const data = points([10, null, 30, 40])
  const chart = chartGeometry(data, 400, 200, chartScale(data), 3)
  expect(chart.points.map(point => point.x)).toEqual([0, 200, 400, 600])
  expect(nearestPoint(chart.points, 0, 100, 400)?.time).toBe(2)
  expect(nearestPoint(chart.points, 400, 100, 400)?.time).toBe(2)
  expect(nearestPoint(chart.points, 400, 200, 400)?.time).toBe(3)
  expect(timeTicks(chart.points, 180).map(point => point.time)).toEqual([0, 3])
  expect(timeTicks([], 200)).toEqual([])
})
