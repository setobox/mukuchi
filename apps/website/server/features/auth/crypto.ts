import { compactDecrypt, CompactEncrypt } from 'jose'

const key = (secret: string) => Uint8Array.from(atob(secret), char => char.charCodeAt(0))
export async function protectIdToken(token: string, secret: string) {
  return new CompactEncrypt(new TextEncoder().encode(token)).setProtectedHeader({ alg: 'dir', enc: 'A256GCM' }).encrypt(key(secret))
}
export async function readIdToken(token: string, secret: string) {
  const { plaintext } = await compactDecrypt(token, key(secret), { keyManagementAlgorithms: ['dir'], contentEncryptionAlgorithms: ['A256GCM'] })
  return new TextDecoder().decode(plaintext)
}
