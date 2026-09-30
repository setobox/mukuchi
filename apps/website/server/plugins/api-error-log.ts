import { logApiError, startApiErrorLog } from '../features/logging/api-error'

export default defineNitroPlugin((nitroApp) => {
  if (!import.meta.dev)
    return

  nitroApp.hooks.hook('request', startApiErrorLog)
  nitroApp.hooks.hook('error', (error, { event }) => {
    if (event)
      logApiError(event, error, createError(error).statusCode)
  })
  nitroApp.hooks.hook('afterResponse', (event) => {
    const statusCode = getResponseStatus(event)
    if (statusCode >= 400)
      logApiError(event, undefined, statusCode)
  })
})
