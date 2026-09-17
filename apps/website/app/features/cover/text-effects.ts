import type { TextSettings } from './model'

export function renderTextFill(id: string, fill: TextSettings['fill'], box: { x: number, y: number, width: number, height: number }) {
  if (fill.mode === 'solid')
    return { defs: '', paint: fill.color }
  const stops = [...fill.stops].sort((a, b) => a.position - b.position).map(stop => `<stop offset="${stop.position}%" stop-color="${stop.color}"/>`).join('')
  if (fill.mode === 'radial')
    return { defs: `<radialGradient id="${id}" cx="50%" cy="50%" r="50%">${stops}</radialGradient>`, paint: `url(#${id})` }
  const angle = fill.angle * Math.PI / 180
  const dx = Math.cos(angle)
  const dy = Math.sin(angle)
  const radius = (Math.abs(box.width * dx) + Math.abs(box.height * dy)) / 2
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  return {
    defs: `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${cx - dx * radius}" y1="${cy - dy * radius}" x2="${cx + dx * radius}" y2="${cy + dy * radius}">${stops}</linearGradient>`,
    paint: `url(#${id})`,
  }
}

export function renderTextGlow(glow: TextSettings['glow'], width: number, height: number) {
  if (!glow.enabled)
    return ''
  return `<filter id="cover-text-glow" filterUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}" color-interpolation-filters="sRGB"><feGaussianBlur in="SourceAlpha" stdDeviation="${glow.blur / 2}" result="blur"/><feFlood flood-color="${glow.color}" flood-opacity="${glow.opacity}"/><feComposite in2="blur" operator="in"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>`
}
