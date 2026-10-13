import type { ArchivedTurn } from '../../../shared/assistant/history'
import type { SignedTurn, TurnRequest } from '../../../shared/assistant/model'
import type { AdminDatabase, SqlValue, Statement } from '../admin/database'
import { z } from 'zod'
import { conversationSchema, conversationTitle, localTurnSchema } from '../../../shared/assistant/history'
import { AssistantError, assistantLimits, signedTurnSchema } from '../../../shared/assistant/model'

export function createCloudHistory(db: AdminDatabase) {
  const query = async (sql: string, params: SqlValue[] = []) => (await db.batch([{ sql, params }]))[0]!
  function conversation(row: Record<string, unknown>) {
    return conversationSchema.parse({ id: row.id, namespace: row.actor, title: row.title, createdAt: row.created_at, updatedAt: row.updated_at, version: row.version, syncVersion: row.version, deleted: row.deleted === 1, unread: false })
  }
  async function get(actor: string, id: string) {
    const [row] = await query('SELECT * FROM assistant_conversations WHERE actor = ? AND id = ?', [actor, id])
    return row ? conversation(row) : null
  }
  function message(row: Record<string, unknown>) {
    return localTurnSchema.parse({ id: row.id, namespace: row.actor, conversationId: row.conversation_id, createdAt: row.created_at, user: row.user, page: JSON.parse(z.string().parse(row.page)), status: row.status, ...(row.record ? { record: signedTurnSchema.parse(JSON.parse(z.string().parse(row.record))) } : {}), ...(row.error ? { error: row.error } : {}) })
  }
  const bump = (actor: string, id: string, now: number): Statement => ({ sql: 'UPDATE assistant_conversations SET version = version + 1, updated_at = MAX(updated_at, ?) WHERE actor = ? AND id = ? AND deleted = 0 AND changes() > 0', params: [now, actor, id] })
  return {
    get,
    async begin(actor: string, input: TurnRequest, now: number) {
      if (!actor.startsWith('account:'))
        return
      await db.batch([
        { sql: 'INSERT INTO assistant_conversations(actor,id,title,created_at,updated_at) VALUES (?,?,?,?,?) ON CONFLICT DO NOTHING', params: [actor, input.conversationId, conversationTitle(input.text), now, now] },
        { sql: `INSERT INTO assistant_messages(actor,id,conversation_id,created_at,user,page,status) SELECT ?,?,?,?,?,?,'pending' WHERE EXISTS (SELECT 1 FROM assistant_conversations WHERE actor = ? AND id = ? AND deleted = 0) ON CONFLICT DO NOTHING`, params: [actor, input.requestId, input.conversationId, now, input.text, JSON.stringify(input.page), actor, input.conversationId] },
        bump(actor, input.conversationId, now),
      ])
      if ((await get(actor, input.conversationId))?.deleted)
        throw new AssistantError(409, 'history_deleted', '会话已删除，请新建会话')
    },
    completion(actor: string, record: SignedTurn, now: number): Statement[] {
      if (!actor.startsWith('account:'))
        return []
      return [
        { sql: `UPDATE assistant_messages SET status = 'completed', record = ?, error = NULL WHERE actor = ? AND id = ? AND status = 'pending' AND changes() = 1 AND EXISTS (SELECT 1 FROM assistant_conversations WHERE actor = ? AND id = ? AND deleted = 0)`, params: [JSON.stringify(record), actor, record.id, actor, record.conversationId] },
        bump(actor, record.conversationId, now),
      ]
    },
    terminal(actor: string, id: string, status: string, now: number): Statement[] {
      if (!actor.startsWith('account:'))
        return []
      return [
        { sql: 'UPDATE assistant_messages SET status = ? WHERE actor = ? AND id = ? AND status = \'pending\' AND changes() = 1', params: [status, actor, id] },
        { sql: 'UPDATE assistant_conversations SET version = version + 1, updated_at = MAX(updated_at, ?) WHERE actor = ? AND id = (SELECT conversation_id FROM assistant_messages WHERE actor = ? AND id = ?) AND deleted = 0 AND changes() = 1', params: [now, actor, actor, id] },
      ]
    },
    async list(actor: string, cursor: string | null) {
      await db.batch([
        { sql: `UPDATE assistant_conversations SET version = version + 1 WHERE actor = ? AND deleted = 0 AND id IN (SELECT conversation_id FROM assistant_messages WHERE actor = ? AND status = 'pending' AND created_at < ?)`, params: [actor, actor, Date.now() - assistantLimits.turnMs - 5000] },
        { sql: `UPDATE assistant_messages SET status = 'interrupted' WHERE actor = ? AND status = 'pending' AND created_at < ?`, params: [actor, Date.now() - assistantLimits.turnMs - 5000] },
      ])
      const rows = await query('SELECT * FROM assistant_conversations WHERE actor = ? AND id > ? ORDER BY id LIMIT 51', [actor, cursor ?? ''])
      return { items: rows.slice(0, 50).map(conversation), next: rows.length > 50 ? z.string().parse(rows[49]!.id) : null }
    },
    async messages(actor: string, id: string, cursor: string | null) {
      const [conversations, rows] = await db.batch([
        { sql: 'SELECT * FROM assistant_conversations WHERE actor = ? AND id = ?', params: [actor, id] },
        { sql: 'SELECT * FROM assistant_messages WHERE actor = ? AND conversation_id = ? AND id > ? AND EXISTS (SELECT 1 FROM assistant_conversations WHERE actor = ? AND id = ? AND deleted = 0) ORDER BY id LIMIT 21', params: [actor, id, cursor ?? '', actor, id] },
      ])
      if (!conversations?.[0])
        throw new AssistantError(404, 'history_missing', '会话不存在')
      const row = conversation(conversations[0])
      return { conversation: row, messages: rows!.slice(0, 20).map(message), next: rows!.length > 20 ? z.string().parse(rows![19]!.id) : null }
    },
    async import(actor: string, source: string, id: string, records: SignedTurn[], messages: ArchivedTurn[] = []) {
      const old = await get(actor, id)
      if (old?.deleted)
        throw new AssistantError(409, 'history_deleted', '会话已删除，不会重新导入')
      const entries = [...records.map(record => ({ ...record, status: 'completed', page: { path: null }, record })), ...messages.map(record => ({ ...record, record: null }))]
      const first = entries[0]
      if (!first)
        throw new AssistantError(400, 'history_empty', '没有可导入的消息')
      const statements: Statement[] = [
        { sql: 'INSERT INTO assistant_history_imports(source_actor,conversation_id,owner_actor) VALUES (?,?,?) ON CONFLICT DO NOTHING', params: [source, id, actor] },
        { sql: 'INSERT INTO assistant_conversations(actor,id,title,created_at,updated_at) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM assistant_history_imports WHERE source_actor = ? AND conversation_id = ? AND owner_actor = ?) ON CONFLICT DO NOTHING', params: [actor, id, conversationTitle(first.user), first.createdAt, first.createdAt, source, id, actor] },
      ]
      for (const entry of entries) {
        statements.push({ sql: `INSERT INTO assistant_messages(actor,id,conversation_id,created_at,user,page,status,record) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM assistant_conversations WHERE actor = ? AND id = ? AND deleted = 0) AND EXISTS (SELECT 1 FROM assistant_history_imports WHERE source_actor = ? AND conversation_id = ? AND owner_actor = ?) ON CONFLICT DO NOTHING`, params: [actor, entry.id, id, entry.createdAt, entry.user, JSON.stringify(entry.page), entry.status, entry.record ? JSON.stringify(entry.record) : null, actor, id, source, id, actor] })
        statements.push(bump(actor, id, entry.createdAt))
      }
      await db.batch(statements)
      const [claim] = await query('SELECT owner_actor FROM assistant_history_imports WHERE source_actor = ? AND conversation_id = ?', [source, id])
      if (claim?.owner_actor !== actor)
        throw new AssistantError(409, 'history_claimed', '这段游客历史已保存到其他账号')
      const imported = await get(actor, id)
      if (!imported || imported.deleted)
        throw new AssistantError(409, 'history_deleted', '会话已删除，不会重新导入')
      return imported
    },
    async remove(actor: string, id: string, version: number) {
      const results = await db.batch([
        { sql: 'UPDATE assistant_conversations SET deleted = 1, title = \'\', version = version + 1, updated_at = ? WHERE actor = ? AND id = ? AND version = ? AND deleted = 0 RETURNING id', params: [Date.now(), actor, id, version] },
        { sql: 'DELETE FROM assistant_messages WHERE actor = ? AND conversation_id = ? AND changes() = 1', params: [actor, id] },
      ])
      if (!results[0]?.length)
        throw new AssistantError(409, 'history_conflict', '会话已变化，请刷新后重试')
      return get(actor, id)
    },
    async clear(actor: string) {
      await db.batch([
        { sql: 'UPDATE assistant_conversations SET deleted = 1, title = \'\', version = version + 1, updated_at = ? WHERE actor = ? AND deleted = 0', params: [Date.now(), actor] },
        { sql: 'DELETE FROM assistant_messages WHERE actor = ?', params: [actor] },
      ])
    },
    async restore(actor: string, id: string, version: number, records: SignedTurn[], messages: ArchivedTurn[] = []) {
      const entries = [...records.map(record => ({ ...record, status: 'completed', page: { path: null }, record })), ...messages.map(record => ({ ...record, record: null }))]
      const first = entries[0]
      const results = await db.batch([
        { sql: 'UPDATE assistant_conversations SET deleted = 0, title = ?, version = version + 1, updated_at = ? WHERE actor = ? AND id = ? AND version = ? AND deleted = 1 RETURNING id', params: [conversationTitle(first?.user ?? ''), Date.now(), actor, id, version] },
        ...entries.map(entry => ({ sql: `INSERT INTO assistant_messages(actor,id,conversation_id,created_at,user,page,status,record) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM assistant_conversations WHERE actor = ? AND id = ? AND version = ? AND deleted = 0) ON CONFLICT DO NOTHING`, params: [actor, entry.id, id, entry.createdAt, entry.user, JSON.stringify(entry.page), entry.status, entry.record ? JSON.stringify(entry.record) : null, actor, id, version + 1] })),
      ])
      if (!results[0]?.length)
        throw new AssistantError(409, 'history_conflict', '会话已变化，无法撤销')
      return get(actor, id)
    },
  }
}
