import type { ResolvedTheme } from './preference.ts'
import { themeColors } from '../content/schema.ts'

export type AccentColor = typeof themeColors[number]
export const defaultAccent: AccentColor = '#a369ff'
export const themeSurfaces = {
  dark: { canvas: '#252423', surface: '#302e2d' },
  light: { canvas: '#faf8f5', surface: '#f0ece7' },
} as const

function channels(color: string): number[] {
  return [1, 3, 5].map(start => Number.parseInt(color.slice(start, start + 2), 16))
}

export function mixColor(color: string, target: string, amount: number): string {
  const other = channels(target)
  return `#${channels(color).map((value, index) => Math.round(value * (1 - amount) + other[index]! * amount).toString(16).padStart(2, '0')).join('')}`
}

export function contrastRatio(first: string, second: string): number {
  function luminance(color: string) {
    const [r, g, b] = channels(color).map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    return r! * 0.2126 + g! * 0.7152 + b! * 0.0722
  }
  const a = luminance(first)
  const b = luminance(second)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

export function accentBackgrounds(color: string, mode: ResolvedTheme): string[] {
  const { canvas, surface } = themeSurfaces[mode]
  return [canvas, surface, mixColor(canvas, color, 0.1), mixColor(surface, color, 0.1)]
}

export function readableAccent(color: string, mode: ResolvedTheme): string {
  const backgrounds = accentBackgrounds(color, mode)
  for (let step = 0; step <= 100; step++) {
    const candidate = mixColor(color, mode === 'light' ? '#000000' : '#ffffff', step / 100)
    if (backgrounds.every(background => contrastRatio(candidate, background) >= 4.5))
      return candidate
  }
  throw new Error(`无法生成可读主题色：${color}`)
}

export function normalizeAccent(value: unknown): AccentColor {
  return themeColors.find(color => color === value) ?? defaultAccent
}

export function accentVariables(color: AccentColor): Record<string, string> {
  return {
    '--color-accent': color,
    '--accent-dark-text': readableAccent(color, 'dark'),
    '--accent-light-text': readableAccent(color, 'light'),
  }
}
