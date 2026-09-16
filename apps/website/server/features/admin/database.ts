export type SqlValue = string | number | null
export interface Statement { sql: string, params?: SqlValue[] }
export interface AdminDatabase {
  batch: (statements: Statement[]) => Promise<Record<string, unknown>[][]>
  close: () => void
}
export interface PlatformOptions { filename: string, assetsDirectory: string, postsDirectory: string, imagesDirectory: string, binding: unknown, bucket: unknown }
export interface PrivateStorage {
  put: (id: string, bytes: Uint8Array, mime: string) => Promise<void>
  get: (id: string) => Promise<Uint8Array | null>
  remove: (id: string) => Promise<void>
}
export interface ContentFile { path: string, source: string, hash: string }
export interface PublishImage { path: string, bytes: Uint8Array }
