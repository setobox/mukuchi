import type { z } from 'zod'
import type { SignedTurn } from '../../../shared/assistant/model'
import { AssistantError, signedTurnSchema } from '../../../shared/assistant/model'

const encoder = new TextEncoder()
function encode(value: ArrayBuffer | Uint8Array): string {
  return btoa(String.fromCharCode(...new Uint8Array(value))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function decode(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[\w-]+$/.test(value))
    throw new Error('Invalid encoding')
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
}
async function keyMaterial(secret: string): Promise<CryptoKey> {
  try {
    const bytes = Uint8Array.from(atob(secret), c => c.charCodeAt(0))
    if (bytes.length !== 32)
      throw new Error('Invalid key')
    return await crypto.subtle.importKey('raw', bytes, 'HKDF', false, ['deriveKey'])
  }
  catch { throw new AssistantError(503, 'not_configured', '助手密钥保护尚未配置') }
}
async function derivedKey(secret: string, purpose: string, encryption: boolean) {
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: encoder.encode('setobox-assistant-v1'), info: encoder.encode(purpose) }, await keyMaterial(secret), encryption ? { name: 'AES-GCM', length: 256 } : { name: 'HMAC', hash: 'SHA-256', length: 256 }, false, encryption ? ['encrypt', 'decrypt'] : ['sign', 'verify'])
}
export async function digest(value: string): Promise<string> {
  return encode(await crypto.subtle.digest('SHA-256', encoder.encode(value)))
}

// JSON objects are canonicalized so key ordering survives IndexedDB and JSON transports.
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)))
    return JSON.stringify(value)
  if (Array.isArray(value))
    return `[${value.map(canonicalJson).join(',')}]`
  if (typeof value === 'object' && value)
    return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, v]) => `${JSON.stringify(key)}:${canonicalJson(v)}`).join(',')}}`
  throw new Error('Invalid JSON')
}
export async function signValue(secret: string, purpose: string, value: unknown): Promise<string> {
  return `v1.${encode(await crypto.subtle.sign('HMAC', await derivedKey(secret, purpose, false), encoder.encode(canonicalJson(value))))}`
}
export async function verifyValue(secret: string, purpose: string, value: unknown, proof: string): Promise<boolean> {
  const key = await derivedKey(secret, purpose, false)
  try {
    const [version, signature, extra] = proof.split('.')
    return version === 'v1' && !!signature && !extra && await crypto.subtle.verify('HMAC', key, decode(signature), encoder.encode(canonicalJson(value)))
  }
  catch { return false }
}
export async function signTurn(secret: string, actor: string, input: Omit<SignedTurn, 'proof'>): Promise<SignedTurn> {
  const turn = signedTurnSchema.omit({ proof: true }).parse(input)
  return { ...turn, proof: await signValue(secret, 'history', { actor, turn }) }
}
export async function verifyHistory(secret: string, actor: string, conversationId: string, values: SignedTurn[], now = Date.now()): Promise<SignedTurn[]> {
  let previous = -1
  const ids = new Set<string>()
  const turns: SignedTurn[] = []
  for (const value of values) {
    const parsed = signedTurnSchema.safeParse(value)
    if (!parsed.success)
      throw new AssistantError(400, 'invalid_history', '历史记录无法验证，请新建会话')
    const { proof, ...turn } = parsed.data
    if (turn.conversationId !== conversationId || turn.createdAt < previous || turn.createdAt > now || ids.has(turn.id)
      || !await verifyValue(secret, 'history', { actor, turn }, proof)) {
      throw new AssistantError(400, 'invalid_history', '历史记录无法验证，请新建会话')
    }
    previous = turn.createdAt
    ids.add(turn.id)
    turns.push(parsed.data)
  }
  return turns
}

export async function seal<T>(secret: string, actor: string, purpose: string, value: T): Promise<string> {
  const key = await derivedKey(secret, purpose, true)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const bytes = encoder.encode(canonicalJson(value))
  if (bytes.byteLength > 30_000)
    throw new AssistantError(400, 'context_limit', '本次上下文过长，请缩小问题范围')
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(actor) }, key, bytes)
  return `v1.${encode(iv)}.${encode(cipher)}`
}
export async function unseal<T>(secret: string, actor: string, purpose: string, token: string, schema: z.ZodType<T>): Promise<T> {
  const key = await derivedKey(secret, purpose, true)
  try {
    if (token.length > 45_000)
      throw new Error('Too large')
    const [version, iv, cipher, extra] = token.split('.')
    if (version !== 'v1' || !iv || !cipher || extra)
      throw new Error('Invalid token')
    const bytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(iv), additionalData: encoder.encode(actor) }, key, decode(cipher))
    return schema.parse(JSON.parse(new TextDecoder().decode(bytes)))
  }
  catch { throw new AssistantError(400, 'invalid_continuation', '继续对话的凭据无效或已失效，请重新提问') }
}
