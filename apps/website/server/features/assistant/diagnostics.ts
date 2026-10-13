import process from 'node:process'
import { AssistantError } from '../../../shared/assistant/model'

export type LogValue = string | number | boolean | null | undefined | LogValue[] | { [key: string]: LogValue }
export interface ModelLogRecord {
  timestamp: string
  event: string
  requestId: string | null
  callId: string
  source: string
  attempt: number
  elapsedMs: number
  details: LogValue
}
export interface ModelLogContext {
  requestId?: string
  source?: 'conversation' | 'admin_preview' | 'capability_test'
  /** Tests inject a sink; application calls use the server console. */
  log?: (record: ModelLogRecord) => void
}

export function logFullModelRequest(context: ModelLogContext) {
  return process.env.NODE_ENV === 'development' || context.source === 'admin_preview' || context.source === 'capability_test'
}

function serverLog(record: ModelLogRecord, service: 'model' | 'moderation') {
  if (process.env.NODE_ENV !== 'test') {
    // Structured operational logs belong at info level, not warning level.
    // eslint-disable-next-line no-console
    console.info(`[assistant:${service}] ${JSON.stringify(record)}`)
  }
}

export function modelErrorDetails(error: unknown): LogValue {
  const chain: LogValue[] = []
  let current = error
  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth++) {
    const item = current as Record<string, unknown>
    // Arbitrary exception messages can contain request bodies, URLs or headers.
    // Only application-defined messages are safe; transport diagnosis uses codes.
    chain.push({
      name: typeof item.name === 'string' ? item.name.slice(0, 80) : 'Error',
      code: typeof item.code === 'string' && /^[\w.-]{1,100}$/.test(item.code) ? item.code : undefined,
      ...(current instanceof AssistantError
        ? {
            status: current.statusCode,
            message: current.message,
            diagnostic: 'adminMessage' in current && typeof current.adminMessage === 'string' ? current.adminMessage : undefined,
          }
        : {}),
    })
    current = item.cause
  }
  return chain
}

export function createModelTrace(context: ModelLogContext, secrets: string[]) {
  return createServiceTrace(context, secrets, 'model')
}

/** Raw transport messages are restricted to server logs and scrubbed by the trace. */
export function moderationErrorDetails(error: unknown): LogValue {
  const chain: LogValue[] = []
  const seen = new Set<unknown>()
  let current = error
  for (let depth = 0; depth < 4 && current != null && !seen.has(current); depth++) {
    seen.add(current)
    if (typeof current !== 'object') {
      chain.push({ message: String(current) })
      break
    }
    const item = current as Record<string, unknown>
    chain.push({
      name: typeof item.name === 'string' ? item.name : 'Error',
      message: typeof item.message === 'string' ? item.message : undefined,
      code: typeof item.code === 'string' || typeof item.code === 'number' ? item.code : undefined,
    })
    current = item.cause
  }
  return chain
}

export function createModerationTrace(context: ModelLogContext, secrets: string[]) {
  // Exceptions can reflect form-encoded or JSON-escaped request data.
  const variants = secrets.filter(Boolean).flatMap(value => [value, JSON.stringify(value).slice(1, -1), encodeURIComponent(value.toWellFormed()), new URLSearchParams({ v: value }).toString().slice(2)])
  return createServiceTrace(context, variants, 'moderation')
}

function createServiceTrace(context: ModelLogContext, secrets: string[], service: 'model' | 'moderation') {
  const startedAt = Date.now()
  const callId = crypto.randomUUID()
  const knownSecrets = secrets.filter(Boolean).sort((a, b) => b.length - a.length)
  function clean(value: LogValue, fullText: boolean): LogValue {
    if (typeof value === 'string') {
      let text = value
      for (const secret of knownSecrets) text = text.replaceAll(secret, '[REDACTED]')
      text = text.replace(/Bearer\s+\S+|sk-[\w-]+/gi, '[REDACTED]')
      if (service === 'moderation')
        text = text.replace(/ACS3-HMAC-SHA256\s+[^\r\n"}]+|\b(?:Signature|Credential)=[^\s,;"}]+/gi, '[REDACTED]')
      // JSON.stringify escapes control characters for the single-line log. Keep
      // the actual input's whitespace and length intact when debugging payloads.
      return fullText ? text : text.replace(/\p{Cc}/gu, ' ').slice(0, 2000)
    }
    if (Array.isArray(value))
      return value.map(item => clean(item, fullText))
    if (value && typeof value === 'object')
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clean(item, fullText)]))
    return value
  }
  return (event: string, attempt: number, details: LogValue) => {
    try {
      const record: ModelLogRecord = {
        timestamp: new Date().toISOString(),
        event,
        requestId: typeof context.requestId === 'string' && /^[\w-]{1,100}$/.test(context.requestId) ? context.requestId : null,
        callId,
        source: context.source ?? 'conversation',
        attempt,
        elapsedMs: Date.now() - startedAt,
        details: clean(details, event === 'request_body'),
      }
      if (context.log)
        context.log(record)
      else serverLog(record, service)
    }
    catch { /* Diagnostic sinks must never change model execution. */ }
  }
}
