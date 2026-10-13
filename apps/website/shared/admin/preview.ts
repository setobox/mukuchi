import type { MDCRoot } from '@nuxtjs/mdc'
import type { PostMeta } from '../content/schema'
import { z } from 'zod'
import { postFields } from '../content/schema'
import { sourceSchema } from './model'

export const previewSnapshotSchema = z.object({
  version: z.number().int().positive(),
  source: sourceSchema,
  summaryText: z.string().max(300).optional(),
}).strict()
export type PreviewSnapshot = z.infer<typeof previewSnapshotSchema>
export const previewMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('hello') }).strict(),
  z.object({ type: z.literal('snapshot'), snapshot: previewSnapshotSchema }).strict(),
  z.object({ type: z.literal('closed') }).strict(),
])
export const previewContextSchema = z.object({
  data: postFields.extend({ path: z.string().startsWith('/posts') }),
  assetUrls: z.record(z.string(), z.string().startsWith('/')),
})

export interface ArticlePreview {
  data: PostMeta & { path: string }
  body: MDCRoot
  toc?: { links: PreviewHeading[] }
}
/** Authenticated preview metadata; the browser computes body, TOC and word count. */
export interface ArticlePreviewContext {
  data: ArticlePreview['data']
  assetUrls: Record<string, string>
}
export interface PreviewHeading {
  id: string
  text: string
  depth: number
  children?: PreviewHeading[]
}
