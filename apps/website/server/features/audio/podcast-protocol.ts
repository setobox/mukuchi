import { AudioProviderError } from './provider'

const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true })
export function podcastFrame(event: number, payload: unknown = {}, sessionId = '') {
  const data = encoder.encode(JSON.stringify(payload))
  const session = encoder.encode(sessionId)
  const hasSession = event >= 100
  const bytes = new Uint8Array(12 + data.length + (hasSession ? 4 + session.length : 0))
  const view = new DataView(bytes.buffer)
  bytes.set([0x11, 0x14, 0x10, 0])
  view.setUint32(4, event)
  let offset = 8
  if (hasSession) {
    view.setUint32(offset, session.length)
    bytes.set(session, offset + 4)
    offset += 4 + session.length
  }
  view.setUint32(offset, data.length)
  bytes.set(data, offset + 4)
  return bytes
}
export async function readPodcastFrame(bytes: Uint8Array) {
  const invalid = () => new AudioProviderError('播客协议数据无效', true)
  if (bytes.length < 8 || bytes.length > 4 * 1024 * 1024 || bytes[0]! >> 4 !== 1)
    throw invalid()
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const type = bytes[1]! >> 4
  const flags = bytes[1]! & 15
  let offset = (bytes[0]! & 15) * 4
  const uint = () => {
    if (offset + 4 > bytes.length)
      throw invalid()
    const number = view.getUint32(offset)
    offset += 4
    return number
  }
  const field = () => {
    const length = uint()
    if (length > bytes.length - offset)
      throw invalid()
    const value = bytes.subarray(offset, offset + length)
    offset += length
    return value
  }
  if (type === 15)
    throw new AudioProviderError(`播客接口错误码 ${uint()}`, true)
  if (type !== 9 && type !== 11)
    throw invalid()
  if (flags & 1)
    uint()
  const event = flags & 4 ? uint() : 0
  let sessionId = ''
  if (event >= 100)
    sessionId = decoder.decode(field())
  else if ([50, 51, 52].includes(event))
    field()
  let payload = field()
  if (offset !== bytes.length)
    throw invalid()
  const compression = bytes[2]! & 15
  if (compression === 1) {
    const stream = new Blob([new Uint8Array(payload)]).stream().pipeThrough(new DecompressionStream('gzip'))
    const reader = stream.getReader()
    const chunks: Uint8Array[] = []
    let length = 0
    while (true) {
      const part = await reader.read()
      if (part.done)
        break
      length += part.value.length
      if (length > 4 * 1024 * 1024) {
        await reader.cancel()
        throw invalid()
      }
      chunks.push(part.value)
    }
    payload = new Uint8Array(length)
    let position = 0
    for (const chunk of chunks) {
      payload.set(chunk, position)
      position += chunk.length
    }
  }
  else if (compression !== 0) {
    throw invalid()
  }
  if (event === 361)
    return { event, sessionId, data: {} as Record<string, unknown> }
  try {
    const data: unknown = JSON.parse(decoder.decode(payload))
    if (!data || typeof data !== 'object' || Array.isArray(data))
      throw invalid()
    return { event, sessionId, data: data as Record<string, unknown> }
  }
  catch {
    throw invalid()
  }
}
