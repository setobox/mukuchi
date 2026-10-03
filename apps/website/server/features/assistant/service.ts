import type { H3Event } from 'h3'
import type { TurnResponse } from '../../../shared/assistant/model'
import { z } from 'zod'
import { AssistantError, assistantLimits, continueRequestSchema, turnRequestSchema } from '../../../shared/assistant/model'
import { publicContent } from './content-source'
import { signValue, verifyHistory } from './crypto'
import { createAssistantEngine } from './engine'
import { assistantConfiguration, assistantIdentity, assistantJson, trustedClientIp, withAssistant } from './http'
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
export async function turnsRoute(event: H3Event, continuing = false): Promise<TurnResponse> {
  const identity = await assistantIdentity(event, true)
  const value = await assistantJson(event)
  return withAssistant(event, async (repository) => {
    const config = await assistantConfiguration(event, repository)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(new AssistantError(504, 'turn_timeout', `本轮处理超过 ${assistantLimits.turnMs / 1000} 秒，请稍后重试`)), assistantLimits.turnMs)
    try {
      const engine = createAssistantEngine({ repository, content: publicContent(event), ...config, configVersion: config.version, actor: identity.actor, signal: controller.signal })
      if (continuing) {
        const request = continueRequestSchema.parse(value)
        return await engine.resume(request.continuation, request.history)
      }
      const request = turnRequestSchema.parse(value)
      await verifyHistory(config.secret, identity.actor, request.conversationId, request.history)
      const ip = trustedClientIp(event)
      if (!identity.authenticated)
        await verifyTurnstile({ secret: config.credentials.turnstileSecret, token: request.turnstileToken, hostname: getRequestURL(event).hostname, ip }, controller.signal)
      await repository.clean(Date.now())
      await repository.admit({ id: request.requestId, actor: identity.actor, ipHash: await signValue(config.secret, 'ip', ip), conversationId: request.conversationId, fingerprint: await engine.fingerprint(request), authenticated: identity.authenticated }, config.settings, Date.now())
      try {
        return await engine.start(request)
      }
      catch (error) {
        await repository.end(request.requestId, identity.actor, 'failed')
        throw error
      }
    }
    finally { clearTimeout(timer) }
  })
}
export async function cancelRoute(event: H3Event) {
  const identity = await assistantIdentity(event, true)
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
