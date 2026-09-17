import type { CoverSettings, TextSettings } from './model'
import { coverSchema } from './model'

export type MeasureText = (text: string, style: TextSettings) => number
export function wrapText(text: string, width: number, style: TextSettings, measure: MeasureText) {
  const lines: string[] = []
  let overflow = false
  const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' })
  for (const paragraph of text.replace(/\r\n?/g, '\n').split('\n')) {
    let line = ''
    for (const { segment } of segmenter.segment(paragraph)) {
      if (measure(segment, style) > width)
        overflow = true
      if (line && measure(line + segment, style) > width) {
        lines.push(line)
        line = segment
      }
      else { line += segment }
    }
    lines.push(line)
  }
  return { lines, overflow }
}
export function layoutCover(settings: CoverSettings, measure: MeasureText) {
  const parsed = coverSchema.safeParse(settings)
  if (!parsed.success)
    throw new Error('请检查画布尺寸、文字和数值参数；每侧文字最多 200 字。')
  const s = parsed.data
  if (Math.max(s.width, s.height) * s.scale > 4096)
    throw new Error('导出尺寸单边不能超过 4096px，请降低尺寸或倍率。')
  const padding = Math.min(s.width, s.height) * 0.08
  const occupied = s.iconSize + (s.glass.enabled ? s.glass.padding * 2 : 0)
  const stroke = s.text.stroke.enabled ? s.text.stroke.width / 2 : 0
  const available = (s.width - occupied) / 2 - s.text.offsetX - padding - stroke * 2
  if (occupied > Math.min(s.width, s.height) - padding * 2)
    throw new Error('图标或玻璃底板超出画布，请减小图标尺寸或内边距。')
  const blocks = (['left', 'right'] as const).map((side) => {
    const style = s.text
    const align = side === 'left' ? 'end' : 'start'
    const x = side === 'left' ? (s.width - occupied) / 2 - style.offsetX - stroke : (s.width + occupied) / 2 + style.offsetX + stroke
    const wrapped = wrapText(s[side], available, style, measure)
    const height = wrapped.lines.length * style.size * style.lineHeight
    const top = s.height / 2 + style.offsetY - height / 2
    if (s[side] && (available <= 0 || wrapped.overflow || top - stroke < padding || top + height + stroke > s.height - padding))
      throw new Error(`${side === 'left' ? '左' : '右'}侧文字超出可用空间，请减小字号或调整偏移。`)
    return { style, align, lines: wrapped.lines, x, y: top + style.size * style.lineHeight / 2, width: Math.max(1, ...wrapped.lines.map(line => measure(line, style))), height, top }
  })
  return { blocks, icon: { x: (s.width - s.iconSize) / 2, y: (s.height - s.iconSize) / 2, size: s.iconSize }, plate: { x: (s.width - occupied) / 2, y: (s.height - occupied) / 2, size: occupied } }
}
