import { z } from 'zod'
import { pageContextSchema, signedTurnSchema } from '#shared/assistant/model'

export const conversationSchema = z.object({
  id: z.uuid(),
  namespace: z.string().min(1).max(200),
  title: z.string().max(100),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  version: z.number().int().nonnegative(),
  unread: z.boolean(),
  deleted: z.boolean().default(false),
})
export type Conversation = z.infer<typeof conversationSchema>
export const localTurnSchema = z.object({
  id: z.uuid(),
  conversationId: z.uuid(),
  namespace: z.string().min(1).max(200),
  createdAt: z.number().int().nonnegative(),
  user: z.string().min(1).max(500),
  page: pageContextSchema,
  status: z.enum(['pending', 'completed', 'failed', 'interrupted', 'cancelled']),
  ownerId: z.uuid().optional(),
  record: signedTurnSchema.optional(),
  error: z.string().optional(),
})
export type LocalTurn = z.infer<typeof localTurnSchema>
export interface ConversationGroup { label: '今天' | '7天内' | '7天前', items: Conversation[] }
export function groupConversations(conversations: readonly Conversation[], now = new Date()): ConversationGroup[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const week = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6).getTime()
  const groups: ConversationGroup[] = [{ label: '今天', items: [] }, { label: '7天内', items: [] }, { label: '7天前', items: [] }]
  for (const item of [...conversations].filter(item => !item.deleted).sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id)))
    groups[item.updatedAt >= today ? 0 : item.updatedAt >= week ? 1 : 2]!.items.push(item)
  return groups.filter(group => group.items.length)
}
export function conversationTitle(text: string): string {
  return Array.from(text.trim().replace(/\s+/g, ' ')).slice(0, 24).join('') || '新会话'
}
