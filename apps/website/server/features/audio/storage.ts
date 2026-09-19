import type { R2Bucket } from '@cloudflare/workers-types'
import { AudioProviderError } from './provider'

export const audioSizeLimit = 256 * 1024 * 1024
export async function saveAudio(bucket: R2Bucket, key: string, response: Response) {
  const existing = await bucket.head(key)
  if (existing) {
    await response.body?.cancel()
    return existing.size
  }
  if (!response.ok || !response.body)
    throw new AudioProviderError(`音频下载失败，HTTP ${response.status}`, true, true)
  const declaredSize = Number(response.headers.get('content-length'))
  if (declaredSize > audioSizeLimit)
    throw new AudioProviderError('音频超过 256 MiB 存储限制', true)
  const upload = await bucket.createMultipartUpload(key, { httpMetadata: { contentType: 'audio/mpeg' } })
  const reader = response.body.getReader()
  const partSize = 8 * 1024 * 1024
  let buffer = new Uint8Array(partSize)
  let used = 0
  let total = 0
  let verified = false
  const parts: { partNumber: number, etag: string }[] = []
  async function flush() {
    if (!verified) {
      if (used < 3 || !((buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) || (buffer[0] === 0xFF && (buffer[1]! & 0xE0) === 0xE0)))
        throw new AudioProviderError('供应商返回的文件不是 MP3 音频', true)
      verified = true
    }
    parts.push(await upload.uploadPart(parts.length + 1, buffer.slice(0, used)))
    buffer = new Uint8Array(partSize)
    used = 0
  }
  try {
    while (true) {
      const next = await reader.read()
      if (next.done)
        break
      total += next.value.length
      if (total > audioSizeLimit)
        throw new AudioProviderError('音频超过 256 MiB 存储限制', true)
      let offset = 0
      while (offset < next.value.length) {
        const length = Math.min(partSize - used, next.value.length - offset)
        buffer.set(next.value.subarray(offset, offset + length), used)
        used += length
        offset += length
        if (used === partSize)
          await flush()
      }
    }
    if (used)
      await flush()
    if (!total || (declaredSize && total !== declaredSize))
      throw new AudioProviderError('音频下载不完整', true)
    await upload.complete(parts)
    return total
  }
  catch (error) {
    await upload.abort().catch(() => {})
    throw error
  }
  finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
export function audioRange(header: string | null | undefined, size: number) {
  if (!header)
    return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header)
  if (!match || (!match[1] && !match[2]) || size <= 0)
    return false
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]))
  const end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size)
    return false
  return { offset: start, length: end - start + 1 }
}
export async function audioResponse(bucket: R2Bucket, key: string, request: Request, preview = false) {
  const object = await bucket.head(key)
  if (!object)
    return new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } })
  const headers = new Headers({
    'content-type': 'audio/mpeg',
    'accept-ranges': 'bytes',
    'x-content-type-options': 'nosniff',
    'cache-control': preview ? 'private, no-store' : 'private, max-age=0, must-revalidate',
    'etag': object.httpEtag,
  })
  // Authorization and article-version validation must happen before this function, even for 304.
  if (!request.headers.has('range') && request.headers.get('if-none-match') === object.httpEtag)
    return new Response(null, { status: 304, headers })
  const ifRange = request.headers.get('if-range')
  const range = audioRange(!ifRange || ifRange === object.httpEtag ? request.headers.get('range') : null, object.size)
  if (range === false) {
    headers.set('content-range', `bytes */${object.size}`)
    return new Response(null, { status: 416, headers })
  }
  headers.set('content-length', String(range?.length ?? object.size))
  if (range)
    headers.set('content-range', `bytes ${range.offset}-${range.offset + range.length - 1}/${object.size}`)
  const status = range ? 206 : 200
  if (request.method === 'HEAD')
    return new Response(null, { status, headers })
  const body = await bucket.get(key, range ? { range } : undefined)
  if (!body)
    return new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } })
  return new Response(body.body as unknown as ReadableStream<Uint8Array>, { status, headers })
}
