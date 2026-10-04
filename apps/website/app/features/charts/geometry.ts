/** Unix time in milliseconds. A null value breaks the line instead of implying zero. */
export interface ChartPoint { time: number, value: number | null }
export type ChartDomain = 'zero' | 'fit' | readonly [number, number]
export interface ChartScale { min: number, max: number, ticks: number[] }
export interface PlotPoint extends ChartPoint { x: number, y: number | null }

export function normalizePoints(points: readonly ChartPoint[]): ChartPoint[] {
  const samples = new Map<number, ChartPoint>()
  for (const point of points) {
    if (Number.isFinite(point.time))
      samples.set(point.time, { time: point.time, value: typeof point.value === 'number' && Number.isFinite(point.value) ? point.value : null })
  }
  return [...samples.values()].sort((a, b) => a.time - b.time)
}

export function samePoints(a: readonly ChartPoint[], b: readonly ChartPoint[]) {
  return a.length === b.length && a.every((point, index) => point.time === b[index]?.time && point.value === b[index]?.value)
}

export function isWindowAppend(previous: readonly ChartPoint[], next: readonly ChartPoint[]) {
  return previous.length > 1 && previous.length === next.length
    && next.at(-1)!.time > previous.at(-1)!.time
    && samePoints(previous.slice(1), next.slice(0, -1))
}

function niceStep(value: number) {
  const power = 10 ** Math.floor(Math.log10(value))
  const fraction = value / power
  return ([1, 2, 2.5, 5, 10].find(step => step >= fraction) ?? 10) * power
}

export function chartScale(points: readonly ChartPoint[], domain: ChartDomain = 'zero', integer = false): ChartScale {
  if (Array.isArray(domain) && Number.isFinite(domain[0]) && Number.isFinite(domain[1]) && domain[1] > domain[0]) {
    const [min, max] = domain as [number, number]
    if (integer) {
      const step = Math.max(1, niceStep((max - min) / 4))
      const first = Math.ceil(min / step) * step
      return { min, max, ticks: Array.from({ length: Math.max(0, Math.floor((max - first) / step) + 1) }, (_, i) => first + step * i) }
    }
    return { min, max, ticks: Array.from({ length: 5 }, (_, i) => min + (max - min) * i / 4) }
  }
  let low = Infinity
  let high = -Infinity
  for (const point of points) {
    if (point.value !== null) {
      low = Math.min(low, point.value)
      high = Math.max(high, point.value)
    }
  }
  if (!Number.isFinite(low)) {
    low = 0
    high = 1
  }
  if (domain === 'fit') {
    const padding = (high - low || Math.abs(high) || 1) * 0.1
    low -= padding
    high += padding
  }
  else {
    low = Math.min(0, low)
    high = Math.max(0, high)
    if (low === high)
      high = low + 1
  }
  const step = Math.max(integer ? 1 : Number.MIN_VALUE, niceStep((high - low) / 4))
  const min = Math.floor(low / step) * step
  const max = Math.ceil(high / step) * step
  const ticks = Array.from({ length: Math.round((max - min) / step) + 1 }, (_, i) => Number((min + i * step).toPrecision(12)))
  return { min, max, ticks }
}

export const plotInset = 12
export function ordinate(value: number, height: number, scale: ChartScale) {
  const ratio = Math.max(0, Math.min(1, (value - scale.min) / (scale.max - scale.min)))
  return plotInset + (1 - ratio) * Math.max(1, height - plotInset * 2)
}

const coordinate = (value: number) => Number(value.toFixed(3))
export function chartGeometry(samples: readonly ChartPoint[], width: number, height: number, scale: ChartScale, count = samples.length) {
  const step = count > 1 ? width / (count - 1) : 0
  const points: PlotPoint[] = samples.map((point, i) => ({ ...point, x: count === 1 ? width / 2 : i * step, y: point.value === null ? null : ordinate(point.value, height, scale) }))
  const baseline = ordinate(scale.min, height, scale)
  const segments: PlotPoint[][] = []
  let segment: PlotPoint[] = []
  for (const point of points) {
    if (point.y === null) {
      if (segment.length)
        segments.push(segment)
      segment = []
    }
    else {
      segment.push(point)
    }
  }
  if (segment.length)
    segments.push(segment)
  const lines = segments.map((group) => {
    const first = group[0]!
    let path = `M${coordinate(first.x)},${coordinate(first.y!)}`
    for (let i = 1; i < group.length; i++) {
      const previous = group[i - 1]!
      const point = group[i]!
      const middle = coordinate((previous.x + point.x) / 2)
      path += ` C${middle},${coordinate(previous.y!)} ${middle},${coordinate(point.y!)} ${coordinate(point.x)},${coordinate(point.y!)}`
    }
    return path
  })
  return {
    points,
    step,
    line: lines.join(' '),
    area: segments.map((group, i) => group.length < 2 ? '' : `${lines[i]} L${coordinate(group.at(-1)!.x)},${coordinate(baseline)} L${coordinate(group[0]!.x)},${coordinate(baseline)} Z`).join(' '),
    isolated: segments.filter(group => group.length === 1).map(group => group[0]!),
  }
}

export function nearestPoint(points: readonly PlotPoint[], x: number, offset: number, width: number) {
  let nearest: PlotPoint | undefined
  let distance = Infinity
  for (const point of points) {
    const screenX = point.x - offset
    if (point.y === null || screenX < -0.01 || screenX > width + 0.01)
      continue
    const next = Math.abs(screenX - x)
    if (next < distance) {
      nearest = point
      distance = next
    }
  }
  return nearest
}

export function timeTicks(points: readonly PlotPoint[], width: number) {
  if (!points.length)
    return []
  const count = Math.min(points.length, Math.max(2, Math.floor(width / 90)))
  return [...new Set(Array.from({ length: count }, (_, i) => Math.round(i * (points.length - 1) / Math.max(1, count - 1))))].map(i => points[i]!)
}
