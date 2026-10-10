import { z } from 'zod'
import { assistantLimits } from './limits'
import { articlePathSchema } from './paths'
import { presentationSchemas, presentationText, sourceIdsSchema } from './presentation'

export { assistantLimits } from './limits'
export { articlePathSchema } from './paths'

export const pageContextSchema = z.object({ path: articlePathSchema.nullable() }).strict()
export type AssistantPage = z.infer<typeof pageContextSchema>
export const referenceSchema = z.object({
  articleId: articlePathSchema,
  title: z.string().min(1).max(200),
  path: articlePathSchema,
  sectionId: z.string().min(1).max(200).regex(/^[^\s#?\\]+$/).optional(),
  sourceId: z.string().max(720).optional(),
  excerpt: z.string().max(300).optional(),
  sectionTitle: z.string().max(200).optional(),
}).strict()
export type ArticleReference = z.infer<typeof referenceSchema>
export const articleCardSchema = referenceSchema.omit({ sectionId: true }).extend({ description: z.string().max(300) })
export type ArticleCard = z.infer<typeof articleCardSchema>
export const taxonomyItemSchema = z.object({
  kind: z.enum(['category', 'tag']),
  name: z.string().min(1).max(100),
  count: z.number().int().nonnegative(),
  path: z.string().max(500).regex(/^\/(?:categories|tags)\/[^?#\\\s]+$/),
}).strict()
export const assistantBlockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string().min(1).max(assistantLimits.visibleLength), sourceIds: sourceIdsSchema.optional() }).strict(),
  ...presentationSchemas,
  z.object({ type: z.literal('article_list'), items: z.array(articleCardSchema).min(1).max(5) }).strict(),
  z.object({ type: z.literal('taxonomy_list'), items: z.array(taxonomyItemSchema).min(1).max(12) }).strict(),
  z.object({ type: z.literal('navigation_confirmation'), actionId: z.uuid(), target: referenceSchema, expiresAt: z.number() }).strict(),
  z.object({ type: z.literal('navigation_result'), actionId: z.uuid(), status: z.enum(['succeeded', 'failed', 'cancelled']) }).strict(),
])
export type AssistantBlock = z.infer<typeof assistantBlockSchema>
export const assistantMessageSchema = z.object({
  id: z.uuid(),
  role: z.literal('assistant'),
  blocks: z.array(assistantBlockSchema).min(1).max(assistantLimits.blocks),
  references: z.array(referenceSchema).max(8),
  suggestions: z.array(z.string().min(1).max(100)).max(3).optional(),
}).strict()
export type AssistantMessage = z.infer<typeof assistantMessageSchema>
export const signedTurnSchema = z.object({
  id: z.uuid(),
  conversationId: z.uuid(),
  createdAt: z.number().int().nonnegative(),
  user: z.string().min(1).max(assistantLimits.inputLength),
  assistant: assistantMessageSchema,
  proof: z.string().min(1).max(500),
  durationMs: z.number().int().nonnegative().optional(),
}).strict()
export type SignedTurn = z.infer<typeof signedTurnSchema>
export const turnRequestSchema = z.object({
  requestId: z.uuid(),
  conversationId: z.uuid(),
  text: z.string().trim().min(1, '请输入问题').max(assistantLimits.inputLength, '问题最多 500 个字符'),
  page: pageContextSchema,
  history: z.array(signedTurnSchema).max(8).default([]),
  turnstileToken: z.string().max(2048).optional(),
  pendingActionId: z.uuid().optional(),
}).strict()
export type TurnRequest = z.infer<typeof turnRequestSchema>
export const historyRequestSchema = z.object({ before: z.uuid().nullable(), limit: z.number().int().min(1).max(2) }).strict()
export const continueRequestSchema = z.object({
  continuation: z.string().min(1).max(45_000),
  history: z.array(signedTurnSchema).max(2),
}).strict()
export const turnResponseSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('completed'), record: signedTurnSchema, contextLimited: z.boolean(), navigate: z.uuid().optional() }).strict(),
  z.object({ kind: z.literal('needs_history'), requestId: z.uuid(), conversationId: z.uuid(), continuation: z.string(), historyRequest: historyRequestSchema }).strict(),
  z.object({ kind: z.literal('rejected'), code: z.string(), message: z.string() }).strict(),
])
export type TurnResponse = z.infer<typeof turnResponseSchema>
export const assistantSessionSchema = z.object({
  enabled: z.boolean(),
  namespace: z.string().max(200),
  csrf: z.string().max(200),
  authenticated: z.boolean(),
  turnstileSiteKey: z.string().max(200),
  remaining: z.number().int().nonnegative(),
  inputLimit: z.number().int().positive(),
}).strict()
export type AssistantSession = z.infer<typeof assistantSessionSchema>

export class AssistantError extends Error {
  constructor(public statusCode: number, public code: string, message: string) {
    super(message)
    this.name = 'AssistantError'
  }
}

export function visibleText(message: AssistantMessage): string {
  return [...message.blocks.map((block) => {
    switch (block.type) {
      case 'text': return block.text
      case 'architecture': case 'checklist': case 'comparison': case 'media': case 'workflow': return presentationText(block)
      case 'html': return `${presentationText(block)}\n${block.html.replace(/<[^>]*>/g, ' ')}`
      case 'article_list': return block.items.map(item => `${item.title}\n${item.description}\n${item.path}`).join('\n')
      case 'taxonomy_list': return block.items.map(item => `${item.name} ${item.count}\n${item.path}`).join('\n')
      case 'navigation_confirmation': return `是否打开《${block.target.title}》？\n${block.target.path}`
      case 'navigation_result': return { succeeded: '已打开文章', failed: '文章打开失败', cancelled: '已取消打开文章' }[block.status]
    }
    throw new Error('未知的助手消息块')
  }), ...message.references.map(ref => `${ref.title}\n${ref.path}${ref.sectionId ? `#${ref.sectionId}` : ''}`)].join('\n')
}

export function historyText(turn: SignedTurn): string {
  const text = visibleText({ ...turn.assistant, blocks: turn.assistant.blocks.map(block => 'summary' in block ? { type: 'text', text: `${block.title}\n${block.summary}` } : block) })
  return `用户：${turn.user}\n助手：${text.length > 1600 ? `${text.slice(0, 1550)}…［历史摘要已截断］` : text}`
}
