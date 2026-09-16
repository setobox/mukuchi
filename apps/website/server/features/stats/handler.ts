import type { EventHandlerResponse, H3Event } from 'h3'

export function defineStatsHandler<T extends EventHandlerResponse>(handler: (event: H3Event) => T | Promise<T>) {
  return defineEventHandler(async (event) => {
    setResponseHeader(event, 'cache-control', 'no-store')
    try {
      return await handler(event)
    }
    catch (error) {
      const failure = error instanceof Error && 'statusCode' in error
        && typeof error.statusCode === 'number' && Number.isInteger(error.statusCode)
        && error.statusCode >= 400 && error.statusCode <= 599
        ? { statusCode: error.statusCode, message: error.message }
        : { statusCode: 503, message: '统计数据暂时不可用' }
      if (failure.statusCode === 503)
        console.error('[stats] 请求处理失败')
      setResponseStatus(event, failure.statusCode)
      // Returning the error body preserves no-store; Nitro's default 404 handler replaces it.
      return failure
    }
  })
}
