import { AdminError, imageLimit } from '../../../shared/admin/model'

export function identifyImage(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > imageLimit)
    throw new AdminError(413, '图片不能为空，且不能超过 5 MiB')
  const starts = (signature: number[]) => signature.every((value, i) => bytes[i] === value)
  if (starts([137, 80, 78, 71, 13, 10, 26, 10]) && bytes.length >= 24)
    return { extension: 'png', mime: 'image/png' }
  if (starts([255, 216, 255]) && bytes.length >= 12)
    return { extension: 'jpg', mime: 'image/jpeg' }
  const text = new TextDecoder().decode(bytes.subarray(0, 16))
  if (/^GIF8[79]a/.test(text) && bytes.length >= 13)
    return { extension: 'gif', mime: 'image/gif' }
  if (text.startsWith('RIFF') && text.slice(8, 12) === 'WEBP' && bytes.length >= 20)
    return { extension: 'webp', mime: 'image/webp' }
  throw new AdminError(415, '仅支持 PNG、JPEG、WebP 和 GIF 图片')
}
