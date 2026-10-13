import { z } from 'zod'
import { assistantMessageSchema, pageContextSchema, signedTurnSchema } from './model'

export const conversationSchema = z.object({
  id: z.uuid(),
  namespace: z.string().min(1).max(200),
  title: z.string().max(100),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  version: z.number().int().nonnegative(),
  unread: z.boolean(),
  deleted: z.boolean().default(false),
  syncVersion: z.number().int().nonnegative().optional(),
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
  error: z.string().max(1000).optional(),
  preview: assistantMessageSchema.optional(),
  durationMs: z.number().nonnegative().optional(),
})
export type LocalTurn = z.infer<typeof localTurnSchema>
// Unsigned archived turns are display-only and never become trusted model history.
export const archivedTurnSchema = localTurnSchema.pick({ id: true, createdAt: true, user: true, page: true, error: true }).extend({ status: z.enum(['failed', 'interrupted', 'cancelled']) }).strict()
export type ArchivedTurn = z.infer<typeof archivedTurnSchema>
export const historyPageSchema = z.object({ items: z.array(conversationSchema), next: z.uuid().nullable() })
export const historyMessagesSchema = z.object({ conversation: conversationSchema, messages: z.array(localTurnSchema), next: z.uuid().nullable() })
export const historyImportSchema = z.object({
  source: z.enum(['anonymous', 'account']),
  conversationId: z.uuid(),
  records: z.array(signedTurnSchema).max(8),
  messages: z.array(archivedTurnSchema).max(8).default([]),
}).strict().refine(input => input.records.length + input.messages.length > 0, '没有可导入的消息')
export const historyMutationSchema = z.object({ version: z.number().int().nonnegative() }).strict()
export const historyRestoreSchema = historyMutationSchema.extend({ records: z.array(signedTurnSchema).max(8), messages: z.array(archivedTurnSchema).max(8).default([]) }).strict()
export function conversationTitle(text: string): string {
  return Array.from(text.trim().replace(/\s+/g, ' ')).slice(0, 24).join('') || '新会话'
}
