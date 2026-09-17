import type { MeasureText } from './layout'
import type { CoverIcon, CoverImage, CoverSettings, ShadowSettings } from './model'
import { renderBackground, renderGlass } from './filters'
import { layoutCover } from './layout'
import { coverFontFamily } from './model'
import { renderTextFill, renderTextGlow } from './text-effects'

export function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&apos;' })[char]!)
}
function shadow(id: string, value: ShadowSettings, width: number, height: number) {
  return `<filter id="${id}" filterUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}" color-interpolation-filters="sRGB"><feDropShadow dx="${value.x}" dy="${value.y}" stdDeviation="${value.blur / 2}" flood-color="${value.color}" flood-opacity="${value.opacity}"/></filter>`
}
export function renderCover(settings: CoverSettings, icon: CoverIcon, measure: MeasureText, image?: CoverImage) {
  const layout = layoutCover(settings, measure)
  const { width, height, scale } = settings
  const background = renderBackground(settings, image)
  const glass = renderGlass(settings, layout.plate)
  let textDefs = renderTextGlow(settings.text.glow, width, height)
  const text = layout.blocks.map(({ style, align, lines, x, y, width, height, top }, index) => {
    const fill = renderTextFill(`cover-text-fill-${index}`, style.fill, { x: align === 'end' ? x - width : x, y: top, width, height })
    textDefs += fill.defs
    const stroke = style.stroke.enabled ? ` stroke="${style.stroke.color}" stroke-width="${style.stroke.width}" stroke-linejoin="round" paint-order="stroke fill"` : ''
    return `<text xml:space="preserve" text-anchor="${align}" dominant-baseline="central" font-family="${escapeXml(coverFontFamily)}" font-size="${style.size}" font-weight="${style.weight}" fill="${fill.paint}"${stroke}>${lines.map((line, i) => `<tspan x="${x}" y="${y + i * style.size * style.lineHeight}">${escapeXml(line)}</tspan>`).join('')}</text>`
  }).join('')
  // Icons only reach this boundary from the bundled catalog or the SVG sanitizer.
  const iconSvg = icon.svg.replace('<svg ', `<svg x="${layout.icon.x}" y="${layout.icon.y}" width="${layout.icon.size}" height="${layout.icon.size}" `)
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width * scale}" height="${height * scale}" viewBox="0 0 ${width} ${height}"><defs>${shadow('cover-text-shadow', settings.textShadow, width, height)}${shadow('cover-icon-shadow', settings.iconShadow, width, height)}${background.defs}${glass.defs}${textDefs}</defs>${background.body}${glass.body}<g${settings.textShadow.enabled ? ' filter="url(#cover-text-shadow)"' : ''}><g${settings.text.glow.enabled ? ' filter="url(#cover-text-glow)"' : ''}>${text}</g></g><g color="${settings.iconColor}"${settings.iconShadow.enabled ? ' filter="url(#cover-icon-shadow)"' : ''}>${iconSvg}</g></svg>`
}
export function svgDataUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
