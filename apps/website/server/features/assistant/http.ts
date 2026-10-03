import type { EventHandlerResponse, H3Event } from 'h3'
import type { AssistantRepository } from './repository'
import { z } from 'zod'
import { openDatabase } from '#admin-driver'
import { AdminError } from '../../../shared/admin/model'
import { AssistantError, assistantLimits } from '../../../shared/assistant/model'
import { assistantCredentialsSchema, configurationReady } from '../../../shared/assistant/settings'
import { AuthError } from '../../../shared/auth/model'
import { adminOptions, readLimitedBody, requireOrigin } from '../admin/http'
import { decryptApiKey } from '../ai/crypto'
import { authCookieOptions } from '../auth/http'
import { session } from '../auth/session'
import { logApiError } from '../logging/api-error'
import { canonicalJson, digest, signValue, verifyValue } from './crypto'
import { createAssistantRepository } from './repository'

const anonymousCookie = 'setobox:assistant:v1'

export function assistantSecret(event: H3Event) {
  return String(useRuntimeConfig(event).aiEncryptionKey || '')
}
export function defineAssistantHandler<T extends EventHandlerResponse>(handler: (event: H3Event) => T | Promise<T>) {
  return defineEventHandler(async (event) => {
    setResponseHeader(event, 'cache-control', 'private, no-store')
    try {
      return await handler(event)
    }
    catch (error) {
      const known = error instanceof AssistantError || error instanceof AdminError || error instanceof AuthError
      const status = known ? error.statusCode : error instanceof z.ZodError ? 400 : 503
      logApiError(event, error, status)
      setResponseStatus(event, status)
      return { kind: 'rejected' as const, code: error instanceof AssistantError ? error.code : 'assistant_unavailable', message: known ? error.message : status === 400 ? '请求内容无效，请刷新后重试' : '助手暂不可用，请稍后重试' }
    }
  })
}
export async function withAssistant<T>(event: H3Event, operation: (repository: AssistantRepository) => Promise<T>): Promise<T> {
  const db = openDatabase(adminOptions(event))
  try {
    return await operation(createAssistantRepository(db))
  }
  finally { db.close() }
}
export async function configurationHash(settings: unknown, credentials: unknown) {
  const parsed = z.record(z.string(), z.unknown()).parse(settings)
  const capability = Object.fromEntries(['baseUrl', 'model', 'style', 'region', 'queryService', 'responseService', 'turnstileSiteKey'].map(key => [key, parsed[key]]))
  return digest(canonicalJson({ settings: capability, credentials }))
}
export async function assistantConfiguration(event: H3Event, repository: AssistantRepository, requireEnabled = true) {
  const stored = await repository.settings()
  const secret = assistantSecret(event)
  const credentials = stored.encryptedCredentials ? assistantCredentialsSchema.parse(JSON.parse(await decryptApiKey(stored.encryptedCredentials, secret))) : assistantCredentialsSchema.parse({})
  const hash = await configurationHash(stored.settings, credentials)
  const legacyHash = await digest(canonicalJson({ settings: { ...z.record(z.string(), z.unknown()).parse(stored.legacySettings), enabled: false }, credentials }))
  const verified = !!stored.verifiedHash && (stored.verifiedHash === hash || stored.verifiedHash === legacyHash)
  const ready = configurationReady(stored.settings, credentials) && verified
  if (requireEnabled && (!stored.settings.enabled || !ready))
    throw new AssistantError(503, 'disabled', '助手暂未开放')
  return { ...stored, verifiedHash: verified ? hash : stored.verifiedHash, credentials, ready, secret }
}
export async function assistantIdentity(event: H3Event, write = false) {
  const secret = assistantSecret(event)
  const current = await session(event)
  if (current) {
    if (write) {
      requireOrigin(event)
      if (getHeader(event, 'x-csrf-token') !== current.csrf)
        throw new AssistantError(403, 'invalid_session', '会话已变化，请刷新后重试')
    }
    const actor = `account:${await digest(current.user.id)}`
    return { actor, namespace: actor, csrf: current.csrf, authenticated: true }
  }
  const cookie = getCookie(event, anonymousCookie)
  const [candidate, ...signature] = (cookie && cookie.length <= 200 ? cookie : '').split('.')
  let id = candidate && z.uuid().safeParse(candidate).success && await verifyValue(secret, 'anonymous', candidate, signature.join('.')) ? candidate : null
  if (!id) {
    if (write)
      throw new AssistantError(403, 'invalid_session', '会话已失效，请刷新后重试')
    id = crypto.randomUUID()
    setCookie(event, anonymousCookie, `${id}.${await signValue(secret, 'anonymous', id)}`, authCookieOptions(event, 365 * 86_400))
  }
  const csrf = await signValue(secret, 'csrf', id)
  if (write) {
    requireOrigin(event)
    if (getHeader(event, 'x-csrf-token') !== csrf)
      throw new AssistantError(403, 'invalid_session', '会话校验失败，请刷新后重试')
  }
  return { actor: `anonymous:${id}`, namespace: 'anonymous', csrf, authenticated: false }
}
export function trustedClientIp(event: H3Event): string {
  if (event.context.cloudflare)
    return getHeader(event, 'cf-connecting-ip') ?? 'unknown'
  return event.node.req.socket?.remoteAddress ?? 'unknown'
}
export async function assistantJson(event: H3Event): Promise<unknown> {
  if (getHeader(event, 'content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json')
    throw new AssistantError(415, 'invalid_body', '请求必须使用 JSON')
  const bytes = await readLimitedBody(event, assistantLimits.bodyBytes)
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown
  }
  catch { throw new AssistantError(400, 'invalid_body', '请求内容不是有效的 JSON') }
}
