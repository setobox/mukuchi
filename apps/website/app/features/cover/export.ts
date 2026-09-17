import type { CoverFormat, TextSettings } from './model'
import { loadImage } from './assets'
import { coverFontFamily } from './model'
import { svgDataUrl } from './svg'

export function createTextMeasurer() {
  const context = document.createElement('canvas').getContext('2d')
  if (!context)
    throw new Error('浏览器不支持画布，请使用支持 Canvas 的浏览器。')
  return (text: string, style: TextSettings) => {
    context.font = `${style.weight} ${style.size}px ${coverFontFamily}`
    return context.measureText(text).width
  }
}
export function assertExportType(blob: Blob | null, format: CoverFormat): Blob {
  if (!blob)
    throw new Error('图片生成失败，请降低分辨率后重试。')
  const mime = format === 'svg' ? 'image/svg+xml' : `image/${format}`
  if (blob.type !== mime)
    throw new Error(`浏览器不支持 ${format.toUpperCase()} 导出，请改用 PNG。`)
  return blob
}
export async function exportCover(svg: string, format: CoverFormat, quality = 0.9): Promise<Blob> {
  if (format === 'webp' && (!Number.isFinite(quality) || quality < 0.01 || quality > 1))
    throw new Error('WebP 质量必须为 1% 至 100%。')
  if (format === 'svg')
    return new Blob([svg], { type: 'image/svg+xml' })
  await document.fonts.ready
  const image = await loadImage(svgDataUrl(svg))
  if (!image.naturalWidth || !image.naturalHeight || Math.max(image.naturalWidth, image.naturalHeight) > 4096)
    throw new Error('导出尺寸无效或超过 4096px。')
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  try {
    const context = canvas.getContext('2d')
    if (!context)
      throw new Error('浏览器不支持图片导出。')
    context.drawImage(image, 0, 0)
    return assertExportType(await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, `image/${format}`, quality)), format)
  }
  finally { canvas.width = canvas.height = 0 }
}
export function downloadCover(blob: Blob, format: CoverFormat) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `cover.${format}`
  link.click()
  // Allow the browser's download task to consume the object URL before releasing it.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
