import { AdminError } from '../../../shared/admin/model.ts'

function decode(value: string) {
  return Uint8Array.from(atob(value), char => char.charCodeAt(0))
}
function encode(value: Uint8Array) {
  return btoa(String.fromCharCode(...value))
}
async function encryptionKey(secret: string) {
  try {
    const bytes = decode(secret)
    if (bytes.length !== 32)
      throw new Error('Invalid key')
    return await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt'])
  }
  catch { throw new AdminError(503, 'AI 密钥保护尚未配置，请配置服务端加密密钥') }
}
export async function encryptApiKey(value: string, secret: string) {
  const key = await encryptionKey(secret)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const bytes = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(value))
  return `v1.${encode(iv)}.${encode(new Uint8Array(bytes))}`
}
export async function decryptApiKey(value: string, secret: string) {
  const key = await encryptionKey(secret)
  try {
    const [version, iv, data, extra] = value.split('.')
    if (version !== 'v1' || !iv || !data || extra)
      throw new Error('Invalid ciphertext')
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(iv) }, key, decode(data)))
  }
  catch { throw new AdminError(503, 'AI 服务密钥无法解密，请检查服务端配置') }
}
export async function encryptionReady(secret: string) {
  try {
    await encryptionKey(secret)
    return true
  }
  catch { return false }
}
