import type { H3Event } from 'h3'

declare module 'h3' {
  interface H3EventContext {
    apiErrorLog?: {
      method: string
      path: string
      startedAt: number
      logged: boolean
    }
  }
}

export function startApiErrorLog(event: H3Event) {
  if (event.context.apiErrorLog)
    return

  const path = getRequestURL(event).pathname
  const apiPath = `${useRuntimeConfig(event).app.baseURL.replace(/\/$/, '')}/api`
  if (path !== apiPath && !path.startsWith(`${apiPath}/`))
    return

  event.context.apiErrorLog = { method: event.method, path, startedAt: performance.now(), logged: false }
}

export function logApiError(event: H3Event, error: unknown, statusCode: number) {
  // Only the development plugin initializes request logging.
  const request = event.context.apiErrorLog
  if (!request || request.logged)
    return

  request.logged = true
  const durationMs = Math.round((performance.now() - request.startedAt) * 100) / 100
  // Keep request bodies, query values and authentication headers out of logs.
  console.error(`[API] ${request.method} ${request.path} ${statusCode} (${durationMs}ms)`, {
    method: request.method,
    path: request.path,
    statusCode,
    durationMs,
  }, error ?? '接口返回错误状态')
}
