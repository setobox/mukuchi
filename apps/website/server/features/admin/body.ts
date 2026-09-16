import { AdminError } from '../../../shared/admin/model'

export async function readBoundedStream(stream: ReadableStream<Uint8Array> | undefined, limit: number): Promise<Uint8Array> {
  if (!stream)
    return new Uint8Array()
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done)
        break
      size += value.length
      if (size > limit) {
        await reader.cancel().catch(() => {})
        throw new AdminError(413, '请求内容过大')
      }
      chunks.push(value)
    }
  }
  finally { reader.releaseLock() }
  const body = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.length
  }
  return body
}
