import { z } from 'zod'
import { assistantLimits } from './limits'
import { assistantBlockSchema, referenceSchema, turnResponseSchema } from './model'

export const streamPayloadSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('status'), label: z.string().max(300), tool: z.string().max(80).optional() }).strict(),
  z.object({ type: z.literal('text_delta'), index: z.number().int().min(0).max(assistantLimits.blocks - 1), text: z.string().max(assistantLimits.visibleLength) }).strict(),
  z.object({ type: z.literal('block'), index: z.number().int().min(0).max(assistantLimits.blocks - 1), block: assistantBlockSchema, references: z.array(referenceSchema).max(8) }).strict(),
  z.object({ type: z.literal('result'), response: turnResponseSchema }).strict(),
])
export type StreamPayload = z.infer<typeof streamPayloadSchema>
export const streamEventSchema = z.object({ requestId: z.uuid(), sequence: z.number().int().nonnegative(), payload: streamPayloadSchema }).strict()
export type AssistantStreamEvent = z.infer<typeof streamEventSchema>

export class SseProtocolError extends Error {}

/** SSE framing shared by the provider and POST transport. UTF-8 and lines may split anywhere. */
export async function* readSse(body: ReadableStream<Uint8Array>, signal?: AbortSignal, limit: number = assistantLimits.bodyBytes): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let size = 0
  let buffer = ''
  let lines: string[] = []
  const abort = () => {
    void reader.cancel().catch(() => {})
  }
  signal?.addEventListener('abort', abort, { once: true })
  try {
    while (true) {
      signal?.throwIfAborted()
      const part = await reader.read()
      signal?.throwIfAborted()
      if (!part.done) {
        size += part.value.byteLength
        if (size > limit)
          throw new SseProtocolError('流式响应超过大小限制')
      }
      try {
        buffer += decoder.decode(part.value, { stream: !part.done })
      }
      catch { throw new SseProtocolError('流式响应编码无效') }
      let end = buffer.indexOf('\n')
      while (end !== -1) {
        const line = buffer.slice(0, end).replace(/\r$/, '')
        buffer = buffer.slice(end + 1)
        if (!line) {
          if (lines.length)
            yield lines.join('\n')
          lines = []
        }
        else if (line.startsWith('data:')) {
          lines.push(line.slice(5).replace(/^ /, ''))
        }
        end = buffer.indexOf('\n')
      }
      if (part.done) {
        if (buffer.trim() || lines.length)
          throw new SseProtocolError('流式响应意外中断')
        return
      }
    }
  }
  finally {
    signal?.removeEventListener('abort', abort)
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

export function durationLabel(ms: number): string {
  const seconds = Math.max(1, Math.round(ms / 1000))
  return seconds >= 60 ? `${Math.floor(seconds / 60)}分${seconds % 60}秒` : `${seconds}秒`
}
