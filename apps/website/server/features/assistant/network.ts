import { AssistantError, assistantLimits } from '../../../shared/assistant/model'

export type Fetch = typeof globalThis.fetch
export async function boundedJson(response: Response, limit = assistantLimits.bodyBytes): Promise<unknown> {
  if (!response.ok || response.redirected) {
    await response.body?.cancel()
    throw new AssistantError(503, 'upstream_unavailable', '服务暂不可用，请稍后重试')
  }
  return readBoundedJson(response, limit)
}

// Reads error envelopes under the same byte limit; callers must check HTTP status.
export async function readBoundedJson(response: Response, limit: number): Promise<unknown> {
  if (!response.body)
    throw new AssistantError(503, 'invalid_response', '服务暂不可用，请稍后重试')
  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let size = 0
  let body = ''
  try {
    while (true) {
      const part = await reader.read()
      if (part.done)
        break
      size += part.value.byteLength
      if (size > limit)
        throw new AssistantError(503, 'response_limit', '服务返回内容过长，请缩小问题范围')
      body += decoder.decode(part.value, { stream: true })
    }
    body += decoder.decode()
    return JSON.parse(body) as unknown
  }
  catch (error) {
    await reader.cancel().catch(() => {})
    if (error instanceof AssistantError)
      throw error
    throw new AssistantError(503, 'invalid_response', '服务暂不可用，请稍后重试')
  }
  finally { reader.releaseLock() }
}

export async function withTimeout<T>(parent: AbortSignal, ms: number, operation: (signal: AbortSignal) => Promise<T>, service = '上游服务'): Promise<T> {
  const controller = new AbortController()
  const signal = AbortSignal.any([parent, controller.signal])
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    signal.throwIfAborted()
    const result = await operation(signal)
    signal.throwIfAborted()
    return result
  }
  catch (error) {
    if (parent.aborted)
      throw parent.reason instanceof AssistantError ? parent.reason : new AssistantError(503, 'request_stopped', '本次处理已停止')
    if (controller.signal.aborted)
      throw new AssistantError(504, 'upstream_timeout', `${service}请求超过 ${ms / 1000} 秒未完成，请稍后重试`)
    if (error instanceof AssistantError)
      throw error
    throw new AssistantError(503, 'upstream_unavailable', '服务暂不可用，请稍后重试')
  }
  finally { clearTimeout(timer) }
}
