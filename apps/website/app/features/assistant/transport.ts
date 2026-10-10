import type { TurnResponse } from '#shared/assistant/model'
import type { StreamPayload } from '#shared/assistant/stream'
import { turnResponseSchema } from '#shared/assistant/model'
import { readSse, streamEventSchema } from '#shared/assistant/stream'

export async function readTurnResponse(response: Response, requestId: string, receive: (payload: StreamPayload) => void, signal?: AbortSignal): Promise<TurnResponse> {
  if (!response.headers.get('content-type')?.includes('text/event-stream'))
    return turnResponseSchema.parse(await response.json())
  if (!response.ok || !response.body)
    throw new Error('连接助手失败，请稍后重试')
  let sequence = -1
  for await (const data of readSse(response.body, signal, 2_097_152)) {
    const event = streamEventSchema.parse(JSON.parse(data))
    if (event.requestId !== requestId || event.sequence !== sequence + 1)
      throw new Error('回复事件顺序无效，请重新提问')
    sequence = event.sequence
    if (event.payload.type === 'result')
      return event.payload.response
    receive(event.payload)
  }
  throw new Error('连接已中断，回复尚未完成')
}
