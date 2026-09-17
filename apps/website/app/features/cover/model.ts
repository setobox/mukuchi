import { z } from 'zod'

export const coverFontFamily = '"Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
const color = z.string().regex(/^#[\da-f]{6}$/i)
const number = (min: number, max: number) => z.number().finite().min(min).max(max)
const shadowSchema = z.object({ enabled: z.boolean(), color, opacity: number(0, 1), blur: number(0, 80), x: number(-100, 100), y: number(-100, 100) })
const fillSchema = z.object({
  mode: z.enum(['solid', 'linear', 'radial']),
  color,
  angle: number(0, 360),
  stops: z.array(z.object({ color, position: number(0, 100) })).min(2).max(5),
})
const textSchema = z.object({
  size: number(12, 256),
  weight: z.enum(['400', '500', '600', '700']),
  fill: fillSchema,
  stroke: z.object({ enabled: z.boolean(), color, width: number(1, 16) }),
  glow: z.object({ enabled: z.boolean(), color, opacity: number(0, 1), blur: number(0, 80) }),
  lineHeight: number(1, 2),
  offsetX: number(0, 240),
  offsetY: number(-2048, 2048),
})
export const coverSchema = z.object({
  width: number(240, 4096).int(),
  height: number(240, 4096).int(),
  scale: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  background: color,
  transparent: z.boolean(),
  left: z.string().max(200),
  right: z.string().max(200),
  text: textSchema,
  iconSize: number(24, 2048),
  iconColor: color,
  textShadow: shadowSchema,
  iconShadow: shadowSchema,
  glass: z.object({ enabled: z.boolean(), color, opacity: number(0, 1), padding: number(0, 160), radius: number(0, 256), blur: number(0, 80) }),
  acrylic: z.object({ enabled: z.boolean(), color, opacity: number(0, 1), blur: number(0, 80), noise: number(0, 0.3) }),
})
export type CoverSettings = z.infer<typeof coverSchema>
export type TextSettings = CoverSettings['text']
export type ShadowSettings = CoverSettings['textShadow']
export type CoverFormat = 'png' | 'svg' | 'webp'
export interface RasterCover { blob: Blob, format: 'png' | 'webp' }
export interface CoverIcon { id: string, name: string, svg: string, monochrome: boolean, collection?: string, license?: { name: string, url?: string } }
export interface CoverImage { name: string, dataUrl: string, width: number, height: number }
export function defaultCover(title = '文章标题'): CoverSettings {
  const text: TextSettings = {
    size: 56,
    weight: '600',
    lineHeight: 1.3,
    offsetX: 48,
    offsetY: 0,
    fill: { mode: 'solid', color: '#252423', angle: 0, stops: [{ color: '#f5f2ef', position: 0 }, { color: '#a369ff', position: 100 }] },
    stroke: { enabled: false, color: '#252423', width: 2 },
    glow: { enabled: false, color: '#a369ff', opacity: 0.5, blur: 12 },
  }
  const shadow: ShadowSettings = { enabled: false, color: '#000000', opacity: 0.3, blur: 12, x: 0, y: 8 }
  return {
    width: 1200,
    height: 675,
    scale: 1,
    background: '#ffffff',
    transparent: false,
    left: title,
    right: '',
    text,
    iconSize: 128,
    iconColor: '#a369ff',
    textShadow: { ...shadow },
    iconShadow: { ...shadow },
    glass: { enabled: false, color: '#ffffff', opacity: 0.2, padding: 24, radius: 24, blur: 16 },
    acrylic: { enabled: false, color: '#252423', opacity: 0.25, blur: 20, noise: 0.03 },
  }
}
export const initialIcon: CoverIcon = {
  id: 'code',
  name: '代码',
  monochrome: true,
  svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-14-2 18"/></svg>',
}
