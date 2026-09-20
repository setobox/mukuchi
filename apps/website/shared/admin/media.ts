import { imageLimit } from './model'

export function formatFileSize(bytes: number | null | undefined) {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0)
    return '大小未知'
  if (bytes < 1024)
    return `${bytes} B`
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`
}
export function validateImageFile(file: Pick<File, 'size' | 'type'>) {
  if (!file.size || file.size > imageLimit)
    throw new Error(`图片大小为 ${formatFileSize(file.size)}；请选择非空且不超过 5 MiB 的图片。`)
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type))
    throw new Error('请上传 PNG、JPEG、WebP 或 GIF 图片。')
}
export function validImageAddress(value: string) {
  if (!value || /[\s\\\p{Cc}]/u.test(value))
    return false
  if (value.startsWith('/'))
    return !value.startsWith('//')
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
  }
  catch { return false }
}
export function imageHeaderInfo(headers: Headers) {
  const mime = headers.get('content-type')?.split(';')[0]?.trim() ?? ''
  const length = headers.get('content-length')
  const size = length && /^\d+$/.test(length) ? Number(length) : null
  return { mime: mime.startsWith('image/') ? mime : '', size: size !== null && Number.isSafeInteger(size) && size > 0 ? size : null }
}
