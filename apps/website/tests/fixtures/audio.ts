import type { R2Bucket } from '@cloudflare/workers-types'
import type { AdminDatabase } from '../../server/features/admin/database'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { vi } from 'vite-plus/test'
import { createAudioRepository } from '../../server/features/audio/repository'
import { defaultAudioSettings } from '../../shared/audio/model'

export const audioSettings = { ...defaultAudioSettings, enabled: true, narrationSpeaker: 'voice', podcastSpeaker1: 'host-a', podcastSpeaker2: 'host-b', dailyNarrationCharacters: 100_000, dailyPodcasts: 10 }
export const audioSource = '---\ntitle: 测试文章\ndescription: 原简介\npublish: 2026-09-16\n---\n\n文章正文。\n'
export function audioDatabase() {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(readFileSync(new URL('../../migrations/admin/0003_audio.sql', import.meta.url), 'utf8'))
  const db: AdminDatabase = { close: () => sqlite.close(), async batch(statements) {
    sqlite.exec('BEGIN IMMEDIATE')
    try {
      const result = statements.map(statement => sqlite.prepare(statement.sql).all(...(statement.params ?? [])) as Record<string, unknown>[])
      sqlite.exec('COMMIT')
      return result
    }
    catch (error) {
      sqlite.exec('ROLLBACK')
      throw error
    }
  } }
  return { db, repo: createAudioRepository(db) }
}
export function audioBucket() {
  const objects = new Map<string, Uint8Array>()
  const abort = vi.fn(async () => {})
  const uploadPart = vi.fn(async (partNumber: number, data: Uint8Array) => ({ partNumber, etag: String(data.length) }))
  const head = vi.fn(async (key: string) => objects.has(key) ? { size: objects.get(key)!.length, httpEtag: '"audio-etag"' } : null)
  const get = vi.fn(async (key: string, options?: { range: { offset: number, length: number } }) => {
    const bytes = objects.get(key)
    if (!bytes)
      return null
    const range = options?.range
    return { body: new Response(range ? bytes.slice(range.offset, range.offset + range.length) : bytes).body }
  })
  const bucket = { head, get, async createMultipartUpload(key: string) {
    const parts: Uint8Array[] = []
    return {
      abort,
      async uploadPart(partNumber: number, bytes: Uint8Array) {
        parts.push(bytes)
        return uploadPart(partNumber, bytes)
      },
      async complete() {
        const bytes = new Uint8Array(parts.reduce((size, part) => size + part.length, 0))
        let offset = 0
        for (const part of parts) {
          bytes.set(part, offset)
          offset += part.length
        }
        objects.set(key, bytes)
      },
    }
  } } as unknown as R2Bucket
  return { bucket, objects, abort, uploadPart, get }
}
export const mp3 = () => new Response(new Uint8Array([0x49, 0x44, 0x33, 1, 2, 3]), { headers: { 'content-length': '6', 'content-type': 'audio/mpeg' } })
