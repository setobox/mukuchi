import type { Nuxt } from 'nuxt/schema'
import type { ContentKind } from './development.ts'
import { prepareDevelopmentDocument } from './development.ts'

export interface ContentImportOptions { root: string, fallbackDate: string }

declare module 'nuxt/schema' {
  interface NuxtConfig { contentImport?: Partial<ContentImportOptions> }
  interface NuxtOptions { contentImport: ContentImportOptions }
}

export function contentImportPolicy(nuxt: Nuxt) {
  const { root, fallbackDate } = nuxt.options.contentImport
  const tolerant = nuxt.options.dev || nuxt.options._prepare
  return {
    root,
    fallbackDate,
    tolerant,
    async prepare(source: string, filename: string, kind: ContentKind) {
      return tolerant ? (await prepareDevelopmentDocument(source, filename, kind, fallbackDate)).source : source
    },
  }
}
