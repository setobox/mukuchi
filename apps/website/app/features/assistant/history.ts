import type { SignedTurn } from '#shared/assistant/model'
import type { Conversation, LocalTurn } from './local-model'
import type { LocalDatabase, LocalTransaction } from './storage'
import { z } from 'zod'
import { signedTurnSchema } from '#shared/assistant/model'
import { conversationSchema, conversationTitle, localTurnSchema } from './local-model'
import { LocalHistoryConflict } from './storage'

const preferenceSchema = z.object({ namespace: z.string(), id: z.literal('lastConversation'), value: z.uuid().nullable() })
export interface DeletedConversation { conversation: Conversation, messages: LocalTurn[], deletedVersion: number }
export interface HistoryChange { namespace: string }

async function conversation(tx: LocalTransaction, namespace: string, id: string) {
  const row = await tx.get('conversations', [namespace, id])
  return row === undefined ? null : conversationSchema.parse(row)
}
async function messages(tx: LocalTransaction, namespace: string, conversationId: string) {
  return (await tx.all('messages', namespace)).map(row => localTurnSchema.parse(row)).filter(row => row.conversationId === conversationId).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
}

export function createLocalHistory(db: LocalDatabase, notify: (change: HistoryChange) => void = () => {}) {
  async function write<T>(namespace: string, operation: (tx: LocalTransaction) => Promise<T>) {
    const result = await db.run(true, operation)
    notify({ namespace })
    return result
  }
  return {
    list: (namespace: string) => db.run(false, async tx => (await tx.all('conversations', namespace)).map(row => conversationSchema.parse(row)).filter(row => !row.deleted).sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id))),
    pending: (namespace: string) => db.run(false, async tx => (await tx.all('messages', namespace)).map(row => localTurnSchema.parse(row)).filter(row => row.status === 'pending')),
    messages: (namespace: string, id: string) => db.run(false, async tx => (await conversation(tx, namespace, id))?.deleted === false ? messages(tx, namespace, id) : []),
    recent: (namespace: string) => db.run(false, async (tx) => {
      const value = await tx.get('preferences', [namespace, 'lastConversation'])
      return value ? preferenceSchema.parse(value).value : null
    }),
    select: (namespace: string, id: string | null) => write(namespace, async (tx) => {
      if (id) {
        const row = await conversation(tx, namespace, id)
        if (!row || row.deleted)
          throw new LocalHistoryConflict()
        await tx.put('conversations', { ...row, unread: false, version: row.version + 1 })
      }
      await tx.put('preferences', preferenceSchema.parse({ namespace, id: 'lastConversation', value: id }))
    }),
    async append(value: LocalTurn, expectedVersion: number | null) {
      const turn = localTurnSchema.parse(value)
      if (turn.status !== 'pending' || turn.record)
        throw new LocalHistoryConflict()
      return write(turn.namespace, async (tx) => {
        const previous = await conversation(tx, turn.namespace, turn.conversationId)
        if (previous?.deleted || (previous?.version ?? null) !== expectedVersion || await tx.get('messages', [turn.namespace, turn.id]))
          throw new LocalHistoryConflict()
        const row = conversationSchema.parse(previous
          ? { ...previous, updatedAt: Math.max(previous.updatedAt, turn.createdAt), version: previous.version + 1 }
          : { id: turn.conversationId, namespace: turn.namespace, title: conversationTitle(turn.user), createdAt: turn.createdAt, updatedAt: turn.createdAt, version: 0, unread: false, deleted: false })
        await tx.put('conversations', row)
        await tx.put('messages', turn)
        await tx.put('preferences', { namespace: turn.namespace, id: 'lastConversation', value: row.id })
        return row
      })
    },
    async finish(namespace: string, conversationId: string, turnId: string, outcome: { status: 'completed', record: SignedTurn } | { status: 'failed' | 'interrupted' | 'cancelled', error?: string }, unread: boolean, now = Date.now()) {
      return write(namespace, async (tx) => {
        const row = await conversation(tx, namespace, conversationId)
        const raw = await tx.get('messages', [namespace, turnId])
        if (!row || row.deleted || !raw)
          return false
        const turn = localTurnSchema.parse(raw)
        if (turn.conversationId !== conversationId || turn.status !== 'pending')
          return false
        if (outcome.status === 'completed') {
          const record = signedTurnSchema.parse(outcome.record)
          if (record.id !== turn.id || record.conversationId !== conversationId || record.user !== turn.user)
            throw new LocalHistoryConflict()
        }
        await tx.put('messages', localTurnSchema.parse({ ...turn, ...outcome }))
        await tx.put('conversations', { ...row, updatedAt: Math.max(row.updatedAt, now), unread: row.unread || unread, version: row.version + 1 })
        return true
      })
    },
    async remove(namespace: string, id: string): Promise<DeletedConversation | null> {
      return write(namespace, async (tx) => {
        const row = await conversation(tx, namespace, id)
        if (!row || row.deleted)
          return null
        const turns = await messages(tx, namespace, id)
        for (const turn of turns) await tx.remove('messages', [namespace, turn.id])
        const deletedVersion = row.version + 1
        // Keep only an ID tombstone. Late responses and stale tabs cannot recreate the conversation.
        await tx.put('conversations', { ...row, title: '', unread: false, deleted: true, version: deletedVersion })
        const recent = await tx.get('preferences', [namespace, 'lastConversation'])
        if (recent && preferenceSchema.parse(recent).value === id)
          await tx.put('preferences', { namespace, id: 'lastConversation', value: null })
        return { conversation: row, messages: turns, deletedVersion }
      })
    },
    async undo(snapshot: DeletedConversation) {
      const original = conversationSchema.parse(snapshot.conversation)
      const turns = snapshot.messages.map(turn => localTurnSchema.parse(turn))
      return write(original.namespace, async (tx) => {
        const row = await conversation(tx, original.namespace, original.id)
        if (!row?.deleted || row.version !== snapshot.deletedVersion)
          return false
        for (const turn of turns) {
          if (turn.namespace !== original.namespace || turn.conversationId !== original.id)
            throw new LocalHistoryConflict()
          await tx.put('messages', turn.status === 'pending' ? { ...turn, status: 'cancelled' } : turn)
        }
        await tx.put('conversations', { ...original, unread: false, version: row.version + 1 })
        return true
      })
    },
    clear: (namespace: string) => write(namespace, async (tx) => {
      for (const raw of await tx.all('conversations', namespace)) {
        const row = conversationSchema.parse(raw)
        await tx.put('conversations', { ...row, title: '', unread: false, deleted: true, version: row.version + 1 })
      }
      for (const raw of await tx.all('messages', namespace)) {
        const row = localTurnSchema.parse(raw)
        await tx.remove('messages', [namespace, row.id])
      }
      await tx.put('preferences', { namespace, id: 'lastConversation', value: null })
    }),
    interruptOwner: (namespace: string, ownerId: string) => write(namespace, async (tx) => {
      for (const raw of await tx.all('messages', namespace)) {
        const turn = localTurnSchema.parse(raw)
        if (turn.status === 'pending' && turn.ownerId === ownerId)
          await tx.put('messages', { ...turn, status: 'interrupted' })
      }
    }),
    // Only interrupt expired tasks: another live tab may own a recent request.
    interruptExpired: (namespace: string, before: number) => write(namespace, async (tx) => {
      let changed = 0
      for (const raw of await tx.all('messages', namespace)) {
        const turn = localTurnSchema.parse(raw)
        if (turn.status === 'pending' && turn.createdAt <= before) {
          await tx.put('messages', { ...turn, status: 'interrupted' })
          changed++
        }
      }
      return changed
    }),
    close: () => db.close(),
  }
}

export type LocalHistory = ReturnType<typeof createLocalHistory>
