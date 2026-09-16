import slugify from 'slugify'
import { z } from 'zod'

export const sourceLimit = 512 * 1024
export const imageLimit = 5 * 1024 * 1024
export const sourceSchema = z.string().max(sourceLimit).refine(value => new TextEncoder().encode(value).length <= sourceLimit, '文章不能超过 512 KiB')
export const filePathSchema = z.string().min(4).max(240).refine((value) => {
  if (!value.endsWith('.md') || /[\\%:#?<>"|*\p{Cc}]/u.test(value) || !value.isWellFormed())
    return false
  return value.split('/').every(part => !!part && part !== '.' && part !== '..' && !part.startsWith('.') && !/[. ]$/.test(part) && !/^(?:con|prn|aux|nul|com\d|lpt\d)(?:\.|$)/i.test(part))
}, '使用文章目录内的相对 .md 路径，不能包含隐藏目录、路径跳转或特殊字符')
export const draftSchema = z.object({
  id: z.uuid(),
  path: filePathSchema,
  source: sourceSchema,
  version: z.number().int().positive(),
  baseHash: z.string().nullable(),
  publishedVersion: z.number().int().nonnegative(),
  updatedAt: z.string(),
})
export type Draft = z.infer<typeof draftSchema>
export const saveDraftSchema = z.object({ version: z.number().int().positive(), source: sourceSchema }).strict()
export const createDraftSchema = z.object({ path: filePathSchema, source: sourceSchema.optional() }).strict()
export const publicationInput = z.object({ draftId: z.uuid(), version: z.number().int().positive(), operationId: z.uuid(), action: z.enum(['publish', 'unpublish']) }).strict()
export const publicationSchema = z.object({
  id: z.uuid(),
  draftId: z.uuid(),
  version: z.number(),
  action: z.enum(['publish', 'unpublish']),
  status: z.enum(['preparing', 'submitted', 'building', 'live', 'local', 'failed', 'unknown']),
  commit: z.string().nullable(),
  message: z.string(),
  createdAt: z.string(),
  url: z.string().nullable(),
})
export type Publication = z.infer<typeof publicationSchema>
export const assetSchema = z.object({ id: z.uuid(), draftId: z.uuid(), path: z.string(), mime: z.string(), size: z.number(), hash: z.string(), createdAt: z.string() })
export type Asset = z.infer<typeof assetSchema>
export interface Account { id: number, login: string, avatar: string, owner: boolean, local: boolean }
export interface SessionInfo { user: Account | null, csrf: string | null, localAvailable: boolean, loginAvailable: boolean }
export interface ArticleEntry { path: string, title: string, hash: string, draft: Draft | null }
export const publicationLabels: Record<Publication['status'], string> = {
  preparing: '提交中',
  submitted: '已提交',
  building: '构建中',
  live: '已上线',
  local: '已发布到本地',
  failed: '失败',
  unknown: '状态暂不可用',
}
export function newArticleSource() {
  const today = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10)
  return `---\ntitle: ''\ndescription: ''\npublish: '${today}'\ntags: []\ncategories: []\n---\n\n`
}
export function articleTitle(source: string, fallback: string) {
  const line = source.split(/\r?\n/).find(line => line.startsWith('title:'))
  const value = line?.slice(6).trim().replace(/^['"]|['"]$/g, '')
  return value || fallback
}
export function articleRoute(path: string) {
  const normalized = path.replace(/\.md$/, '').split('/').map(part => slugify(/^\d+(?:\.\d+)*(?:\.x)?$/.test(part) ? part : part.replace(/(\d+\.)?(.*)/, '$2').replace(/^index(\.draft)?$/, '').replace(/\.draft$/, ''))).join('/').replace(/\/$/, '')
  return `/posts${normalized ? `/${normalized}` : ''}`
}
export class AdminError extends Error {
  constructor(public statusCode: number, message: string) { super(message) }
}
export async function sha256(input: string | Uint8Array): Promise<string> {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes)))].map(n => n.toString(16).padStart(2, '0')).join('')
}
