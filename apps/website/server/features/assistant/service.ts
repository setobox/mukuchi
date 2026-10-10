import type { H3Event } from 'h3'
import type { TurnResponse } from '../../../shared/assistant/model'
import type { StreamPayload } from '../../../shared/assistant/stream'
import { z } from 'zod'
import { AssistantError, assistantLimits, continueRequestSchema, turnRequestSchema } from '../../../shared/assistant/model'
import { publicContent } from './content-source'
import { signValue, verifyHistory } from './crypto'
import { createAssistantEngine } from './engine'
import { assistantConfiguration, assistantIdentity, assistantJson, previewConfiguration, previewIdentity, trustedClientIp, withAssistant } from './http'
import { taskFailure } from './tasks'
import { verifyTurnstile } from './turnstile'

export async function sessionRoute(event: H3Event) {
  const disabled = { enabled: false, namespace: '', csrf: '', authenticated: false, turnstileSiteKey: '', remaining: 0, inputLimit: assistantLimits.inputLength }
  return withAssistant(event, async (repository) => {
    const config = await assistantConfiguration(event, repository, false)
    if (!config.settings.enabled || !config.ready)
      return disabled
    const identity = await assistantIdentity(event)
    return { enabled: true, namespace: identity.namespace, csrf: identity.csrf, authenticated: identity.authenticated, turnstileSiteKey: config.settings.turnstileSiteKey, inputLimit: assistantLimits.inputLength, remaining: await repository.remaining(identity.actor, identity.authenticated ? config.settings.userDay : config.settings.guestDay, Date.now()) }
  })
}
export async function previewSessionRoute(event: H3Event) {
  const identity = await previewIdentity(event)
  return withAssistant(event, async (repository) => {
    const config = await previewConfiguration(event, repository)
    return { model: config.settings.model, session: { enabled: true, namespace: identity.namespace, csrf: identity.csrf, authenticated: true, turnstileSiteKey: '', remaining: 0, inputLimit: assistantLimits.inputLength } }
  })
}
export async function turnsRoute(event: H3Event, continuing = false, preview = false): Promise<TurnResponse | Response> {
  const identity = preview ? await previewIdentity(event) : await assistantIdentity(event, true)
  const value = await assistantJson(event)
  const streaming = getHeader(event, 'accept')?.includes('text/event-stream') ?? false
  const firstRequest = continuing ? null : turnRequestSchema.parse(value)
  const continuation = continuing ? continueRequestSchema.parse(value) : null
  let requestId = firstRequest?.requestId ?? (streaming ? z.uuid().parse(getHeader(event, 'x-assistant-request-id')) : '')
  const controller = new AbortController()
  const perform = (emit?: (id: string, payload: StreamPayload) => void) => withAssistant(event, async (repository) => {
    const config = await (preview ? previewConfiguration(event, repository) : assistantConfiguration(event, repository))
    const timer = setTimeout(() => controller.abort(new AssistantError(504, 'turn_timeout', `本轮处理超过 ${assistantLimits.turnMs / 1000} 秒，请稍后重试`)), assistantLimits.turnMs)
    try {
      const engine = createAssistantEngine({ repository, content: publicContent(event), ...config, preview, configVersion: config.version, actor: identity.actor, signal: controller.signal, emit })
      if (continuation)
        return await engine.resume(continuation.continuation, continuation.history)
      const request = firstRequest!
      await verifyHistory(config.secret, identity.actor, request.conversationId, request.history)
      const ip = trustedClientIp(event)
      if (!identity.authenticated)
        await verifyTurnstile({ secret: config.credentials.turnstileSecret, token: request.turnstileToken, hostname: getRequestURL(event).hostname, ip }, controller.signal)
      await repository.clean(Date.now())
      const admission = { id: request.requestId, actor: identity.actor, conversationId: request.conversationId, fingerprint: await engine.fingerprint(request), configVersion: config.version }
      if (preview)
        await repository.admitPreview(admission, Date.now())
      else
        await repository.admit({ ...admission, ipHash: await signValue(config.secret, 'ip', ip), authenticated: identity.authenticated }, config.settings, Date.now())
      try {
        return await engine.start(request)
      }
      catch (error) {
        const failure = taskFailure(error, Object.values(config.credentials))
        await repository.end(request.requestId, identity.actor, 'failed', failure)
        if (preview)
          throw new AssistantError(failure.status ?? 503, failure.code, failure.message)
        throw error
      }
    }
    finally { clearTimeout(timer) }
  })
  if (!streaming)
    return perform()
  const encoder = new TextEncoder()
  let sequence = 0
  let closed = false
  let work: Promise<void> | undefined
  const disconnect = () => controller.abort(new AssistantError(499, 'request_stopped', '连接已断开'))
  const body = new ReadableStream<Uint8Array>({
    start(stream) {
      const send = (id: string, payload: StreamPayload) => {
        if (closed)
          return
        requestId = id
        stream.enqueue(encoder.encode(`data: ${JSON.stringify({ requestId: id, sequence: sequence++, payload })}\n\n`))
      }
      // Keep the repository open for the entire producer lifetime, including on Workers.
      event.node.res.once('close', disconnect)
      work = perform(send).then((response) => {
        if (!controller.signal.aborted)
          send(requestId, { type: 'result', response })
      }).catch((error: unknown) => {
        if (!closed)
          send(requestId, { type: 'result', response: { kind: 'rejected', code: error instanceof AssistantError ? error.code : 'assistant_unavailable', message: error instanceof AssistantError ? error.message : '助手暂不可用，请稍后重试' } })
      }).finally(() => {
        event.node.res.off('close', disconnect)
        if (!closed) {
          closed = true
          stream.close()
        }
      })
    },
    cancel() {
      closed = true
      disconnect()
      return work
    },
  })
  return new Response(body, { headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'private, no-store, no-transform', 'x-accel-buffering': 'no' } })
}
export async function cancelRoute(event: H3Event, preview = false) {
  const identity = preview ? await previewIdentity(event) : await assistantIdentity(event, true)
  const id = z.uuid().parse(getRouterParam(event, 'requestId'))
  await withAssistant(event, repository => repository.end(id, identity.actor, 'cancelled'))
  return { cancelled: true }
}
const claimSchema = z.object({ conversationId: z.uuid(), clicked: z.boolean() }).strict()
const receiptSchema = z.object({ conversationId: z.uuid(), status: z.enum(['succeeded', 'failed', 'cancelled']) }).strict()
export async function claimRoute(event: H3Event) {
  const identity = await assistantIdentity(event, true)
  const id = z.uuid().parse(getRouterParam(event, 'id'))
  const input = claimSchema.parse(await assistantJson(event))
  return withAssistant(event, async (repository) => {
    await assistantConfiguration(event, repository)
    const action = await repository.action(id, identity.actor, input.conversationId, Date.now())
    if (!action || !await publicContent(event).article(action.article_id))
      throw new AssistantError(409, 'action_expired', '目标文章不可访问或操作已失效')
    const claimed = await repository.claimAction(id, identity.actor, input.conversationId, Date.now(), input.clicked)
    return { path: claimed.article_id, actionId: id }
  })
}
export async function resultRoute(event: H3Event) {
  const identity = await assistantIdentity(event, true)
  const id = z.uuid().parse(getRouterParam(event, 'id'))
  const input = receiptSchema.parse(await assistantJson(event))
  await withAssistant(event, repository => repository.actionResult(id, identity.actor, input.conversationId, input.status))
  return { recorded: true }
}
