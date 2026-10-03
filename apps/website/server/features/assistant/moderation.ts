import type { AssistantCredentials, AssistantSettings } from '../../../shared/assistant/settings'
import type { Fetch } from './network'
import { z } from 'zod'
import { AssistantError, assistantLimits } from '../../../shared/assistant/model'
import { boundedJson, readBoundedJson, withTimeout } from './network'

const aliyunErrors = {
  'NoPermission': ['permission_denied', '当前 AccessKey 未获授权，请主账号为对应 RAM 身份添加 AliyunYundunGreenWebFullAccess 系统策略，并检查 AI 安全护栏服务是否已开通。'],
  'Forbidden.RAM': ['permission_denied', '当前 RAM 身份未获授权，请检查 AliyunYundunGreenWebFullAccess 系统策略及显式拒绝策略。'],
  'InvalidAccessKeyId.NotFound': ['invalid_credentials', 'AccessKey ID 无效，请检查后台保存的阿里云凭据。'],
  'InvalidAccessKeyId.Inactive': ['invalid_credentials', 'AccessKey 已停用，请检查后台保存的阿里云凭据。'],
  'SignatureDoesNotMatch': ['invalid_signature', '请求签名校验失败，请检查 AccessKey ID 与 Secret 是否配套。'],
  'ServiceNotOpen': ['service_not_open', '审核服务尚未开通，请检查 AI 安全护栏服务及所选地域。'],
  'Throttling': ['rate_limited', '阿里云请求频率受限，请稍后重试。'],
} as const
type AliyunCode = keyof typeof aliyunErrors
const failureSchema = z.object({ Code: z.union([z.string(), z.number()]) })

export class AliyunModerationError extends AssistantError {
  readonly adminMessage: string
  readonly adminStatusCode: number
  readonly upstreamCode?: string
  readonly requestId?: string

  constructor(readonly upstreamStatus: number, value: unknown) {
    const parsed = failureSchema.safeParse(value)
    const code = parsed.success && typeof parsed.data.Code === 'string' && Object.hasOwn(aliyunErrors, parsed.data.Code) ? parsed.data.Code as AliyunCode : null
    const reason = code ? aliyunErrors[code] : null
    super(503, `moderation_${reason?.[0] ?? 'unavailable'}`, '安全检查暂不可用，请稍后再试')
    this.name = 'AliyunModerationError'
    this.upstreamCode = code ?? undefined
    const request = z.object({ RequestId: z.uuid() }).safeParse(value)
    this.requestId = request.success ? request.data.RequestId : undefined
    this.adminStatusCode = reason && reason[0] !== 'rate_limited' ? 422 : 503
    this.adminMessage = `阿里云审核失败（HTTP ${upstreamStatus}${code ? ` / ${code}` : ''}）：${reason?.[1] ?? '请检查审核服务、地域和接口配置，或稍后重试。'}`
  }
}

const encoder = new TextEncoder()
function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('')
}
async function sha256(value: string) {
  return hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)))
}
export async function aliyunAuthorization(input: { host: string, body: string, action: string, version: string, date: string, nonce: string, keyId: string, keySecret: string, query?: string }): Promise<Record<string, string>> {
  // ACS3 specification: https://help.aliyun.com/zh/sdk/product-overview/v3-request-structure-and-signature
  const hash = await sha256(input.body)
  const headers: Record<string, string> = { 'host': input.host, 'x-acs-action': input.action, 'x-acs-content-sha256': hash, 'x-acs-date': input.date, 'x-acs-signature-nonce': input.nonce, 'x-acs-version': input.version }
  const names = Object.keys(headers).sort()
  const signedHeaders = names.join(';')
  const canonical = ['POST', '/', input.query ?? '', `${names.map(name => `${name}:${headers[name]!.trim()}`).join('\n')}\n`, signedHeaders, hash].join('\n')
  const key = await crypto.subtle.importKey('raw', encoder.encode(input.keySecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = hex(await crypto.subtle.sign('HMAC', key, encoder.encode(`ACS3-HMAC-SHA256\n${await sha256(canonical)}`)))
  return { ...headers, authorization: `ACS3-HMAC-SHA256 Credential=${input.keyId},SignedHeaders=${signedHeaders},Signature=${signature}` }
}

const suggestion = z.enum(['pass', 'block', 'mask', 'watch'])
export const moderationResponseSchema = z.object({
  Code: z.literal(200),
  Data: z.object({ Suggestion: suggestion, Detail: z.array(z.object({ Type: z.string().min(1), Suggestion: suggestion })).min(1).max(20) }),
})
export const requiredModerationDimensions = ['contentModeration', 'promptAttack'] as const
export function moderationPassed(value: unknown): boolean {
  const result = moderationResponseSchema.safeParse(value)
  if (!result.success)
    throw new AssistantError(503, 'moderation_unavailable', '安全检查暂不可用，请稍后再试')
  const { Data: data } = result.data
  if (requiredModerationDimensions.some(type => !data.Detail.some(item => item.Type === type)))
    throw new AssistantError(503, 'moderation_incomplete', '安全检查配置尚未完成，助手暂不可用')
  return data.Suggestion === 'pass' && data.Detail.every(item => item.Suggestion === 'pass')
}
export async function moderate(text: string, direction: 'input' | 'output', settings: AssistantSettings, credentials: AssistantCredentials, signal: AbortSignal, fetcher: Fetch = fetch): Promise<boolean> {
  if (!text || text.length > assistantLimits.contextLength)
    throw new AssistantError(400, 'context_limit', '本次上下文过长，请缩小问题范围')
  return withTimeout(signal, assistantLimits.moderationMs, async (activeSignal) => {
    const host = `green-cip.${settings.region}.aliyuncs.com`
    const body = new URLSearchParams({ Service: direction === 'input' ? settings.queryService : settings.responseService, ServiceParameters: JSON.stringify({ content: text }) }).toString()
    const headers = await aliyunAuthorization({ host, body, action: 'MultiModalGuard', version: '2022-03-02', date: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'), nonce: crypto.randomUUID(), keyId: credentials.aliyunKeyId, keySecret: credentials.aliyunKeySecret })
    const response = await fetcher(`https://${host}/`, { method: 'POST', body, headers: { ...headers, 'content-type': 'application/x-www-form-urlencoded', 'accept': 'application/json' }, signal: activeSignal, redirect: 'error' })
    if (response.status !== 200 && !response.redirected) {
      // Never forward Message/Recommend/HostId: error bodies may contain credentials.
      const failure = await readBoundedJson(response, 8192).catch(() => null)
      throw new AliyunModerationError(response.status, failure)
    }
    const value = await boundedJson(response)
    const envelope = failureSchema.safeParse(value)
    if (envelope.success && envelope.data.Code !== 200)
      throw new AliyunModerationError(response.status, value)
    return moderationPassed(value)
  }, '阿里云审核')
}
