import type { Conversation } from '#shared/assistant/history'

export { conversationSchema, conversationTitle, localTurnSchema } from '#shared/assistant/history'
export type { Conversation, LocalTurn } from '#shared/assistant/history'

export interface ConversationGroup { label: '今天' | '7天内' | '7天前', items: Conversation[] }
export function groupConversations(conversations: readonly Conversation[], now = new Date()): ConversationGroup[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const week = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6).getTime()
  const groups: ConversationGroup[] = [{ label: '今天', items: [] }, { label: '7天内', items: [] }, { label: '7天前', items: [] }]
  for (const item of [...conversations].filter(item => !item.deleted).sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id)))
    groups[item.updatedAt >= today ? 0 : item.updatedAt >= week ? 1 : 2]!.items.push(item)
  return groups.filter(group => group.items.length)
}
