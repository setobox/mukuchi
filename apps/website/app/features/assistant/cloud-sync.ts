import type { ArchivedTurn } from '#shared/assistant/history'
import type { AssistantSession, SignedTurn } from '#shared/assistant/model'
import type { LocalHistory } from './history'
import type { Conversation, LocalTurn } from './local-model'
import { historyMessagesSchema, historyPageSchema } from '#shared/assistant/history'
import { assistantLimits } from '#shared/assistant/model'

export type HistoryRequest = (path: string, method: 'GET' | 'POST' | 'DELETE', body?: unknown, csrf?: string) => Promise<unknown>
export function recordBatches(records: SignedTurn[]) {
  const batches: SignedTurn[][] = []
  for (const record of records) {
    const last = batches.at(-1)
    if (last && last.length < 8 && new TextEncoder().encode(JSON.stringify([...last, record])).byteLength < assistantLimits.historyUploadBytes)
      last.push(record)
    else batches.push([record])
  }
  return batches
}
export function turnBatches(turns: LocalTurn[]) {
  const records = turns.flatMap(turn => turn.status === 'completed' && turn.record ? [turn.record] : [])
  const messages: ArchivedTurn[] = turns.flatMap(turn => turn.status === 'completed' ? [] : [{ id: turn.id, createdAt: turn.createdAt, user: turn.user, page: turn.page, status: turn.status === 'pending' ? 'interrupted' : turn.status, ...(turn.error ? { error: turn.error } : {}) }])
  const batches: { records: SignedTurn[], messages: ArchivedTurn[] }[] = recordBatches(records).map(records => ({ records, messages: [] }))
  for (let index = 0; index < messages.length; index += 8)
    batches.push({ records: [], messages: messages.slice(index, index + 8) })
  return batches
}
export async function syncCloudHistory(options: { history: LocalHistory, request: HistoryRequest, identity: AssistantSession, valid: () => boolean, activeId?: string, importLocal: boolean }) {
  const { history, request, identity, valid, activeId } = options
  const failed: string[] = []
  const migrating = new Map<string, LocalTurn[]>()
  if (options.importLocal) {
    for (const source of [identity.namespace, 'anonymous']) {
      for (const row of await history.list(source)) {
        if (!valid())
          return
        if (source === identity.namespace && row.syncVersion !== undefined)
          continue
        const local = await history.messages(source, row.id)
        if (local.some(turn => turn.status === 'completed' && !turn.record)) {
          failed.push(row.title)
          continue
        }
        const batches = turnBatches(local)
        if (!batches.length)
          continue
        try {
          for (const batch of batches) {
            await request('/conversations/import', 'POST', { source: source === 'anonymous' ? 'anonymous' : 'account', conversationId: row.id, ...batch }, identity.csrf)
            if (!valid())
              return
          }
          if (source === 'anonymous')
            migrating.set(row.id, local)
        }
        catch { failed.push(row.title) }
      }
    }
  }
  let cursor: string | null = null
  do {
    const page = historyPageSchema.parse(await request(`/conversations${cursor ? `?cursor=${cursor}` : ''}`, 'GET'))
    if (!valid())
      return
    for (const row of page.items) {
      const previous = await history.snapshot(identity.namespace, row.id)
      if (previous?.syncVersion === row.syncVersion && !migrating.has(row.id))
        continue
      if (row.deleted) {
        await history.merge(row, [])
        continue
      }
      let messageCursor: string | null = null
      let snapshot: Conversation = row
      let messages: LocalTurn[] = []
      let stable = true
      do {
        const detail = historyMessagesSchema.parse(await request(`/conversations/${row.id}${messageCursor ? `?cursor=${messageCursor}` : ''}`, 'GET'))
        if (!valid())
          return
        if (detail.conversation.syncVersion !== row.syncVersion) {
          stable = false
          break
        }
        snapshot = detail.conversation
        messages = [...messages, ...detail.messages]
        messageCursor = detail.next
      } while (messageCursor)
      // A concurrent append/delete is picked up by the next sync; don't commit a mixed snapshot.
      if (stable && valid()) {
        const originals = migrating.get(row.id)
        if (originals) {
          messages = messages.map((turn) => {
            const original = originals.find(item => item.id === turn.id)
            return original?.preview && !turn.record ? { ...turn, preview: original.preview, durationMs: original.durationMs } : turn
          })
        }
        await history.merge(snapshot, messages, activeId)
        if (originals && valid() && originals.every(turn => messages.some(item => item.id === turn.id)))
          await history.remove('anonymous', row.id)
      }
    }
    cursor = page.next
  } while (cursor && valid())
  if (failed.length)
    throw new Error(`部分本地历史暂未同步（${failed.length} 个会话），记录仍保存在此浏览器。稍后会重试。`)
}
