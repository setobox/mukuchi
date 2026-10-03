import type { AssistantSettings } from '../../../shared/assistant/settings'
import type { TaskError } from '../../../shared/assistant/tasks'
import type { AdminDatabase, SqlValue, Statement } from '../admin/database'
import { z } from 'zod'
import { AssistantError, assistantLimits } from '../../../shared/assistant/model'

import { assistantSettingsSchema, defaultAssistantSettings } from '../../../shared/assistant/settings'
import { createTaskRepository } from './tasks'

const requestSchema = z.object({
  id: z.string(),
  actor: z.string(),
  ip_hash: z.string(),
  conversation_id: z.string(),
  fingerprint: z.string(),
  day: z.string(),
  created_at: z.number(),
  lease_until: z.number(),
  status: z.enum(['active', 'waiting', 'completed', 'cancelled', 'failed']),
  model_calls: z.number().int(),
  tool_calls: z.number().int(),
  history_calls: z.number().int(),
})
export type RequestMetadata = z.infer<typeof requestSchema>
const actionSchema = z.object({
  id: z.string(),
  actor: z.string(),
  conversation_id: z.string(),
  message_id: z.string(),
  article_id: z.string(),
  created_at: z.number(),
  expires_at: z.number(),
  status: z.enum(['pending', 'authorized', 'claimed', 'succeeded', 'failed', 'cancelled']),
})
export type ActionMetadata = z.infer<typeof actionSchema>
export function billingDay(now: number): string {
  return new Date(now + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
}
function integer(value: number): number {
  return z.number().int().nonnegative().safe().parse(value)
}
export function createAssistantRepository(db: AdminDatabase) {
  async function query(sql: string, params: SqlValue[] = []) {
    return (await db.batch([{ sql, params }]))[0]!
  }
  async function request(id: string, actor: string): Promise<RequestMetadata | null> {
    const [row] = await query('SELECT * FROM assistant_requests WHERE id = ? AND actor = ?', [id, actor])
    return row ? requestSchema.parse(row) : null
  }
  const tasks = createTaskRepository(db)
  return {
    tasks,
    async settings() {
      const [row] = await query('SELECT config, encrypted_credentials, version, verified_hash FROM assistant_settings WHERE id = 1')
      const legacySettings: unknown = row ? JSON.parse(z.string().parse(row.config)) : { ...defaultAssistantSettings }
      const raw = z.record(z.string(), z.unknown()).parse(legacySettings)
      const { dailyBudgetMicros: _budget, inputPriceMicrosPerMillion: _input, outputPriceMicrosPerMillion: _output, moderationPriceMicros: _moderation, ...settings } = raw
      return row
        ? { legacySettings, settings: assistantSettingsSchema.parse(settings), encryptedCredentials: z.string().parse(row.encrypted_credentials), version: z.number().int().positive().parse(row.version), verifiedHash: z.string().parse(row.verified_hash) }
        : { legacySettings, settings: { ...defaultAssistantSettings }, encryptedCredentials: '', version: 0, verifiedHash: '' }
    },
    async saveSettings(settings: AssistantSettings, encryptedCredentials: string, version: number, verifiedHash: string) {
      const config = JSON.stringify(assistantSettingsSchema.parse(settings))
      const rows = version === 0
        ? await query('INSERT INTO assistant_settings (id,config,encrypted_credentials,version,verified_hash) VALUES (1,?,?,1,?) ON CONFLICT DO NOTHING RETURNING id', [config, encryptedCredentials, verifiedHash])
        : await query('UPDATE assistant_settings SET config = ?, encrypted_credentials = ?, version = version + 1, verified_hash = ? WHERE id = 1 AND version = ? RETURNING id', [config, encryptedCredentials, verifiedHash, integer(version)])
      if (!rows.length)
        throw new AssistantError(409, 'settings_conflict', '助手设置已在其他窗口修改，请刷新后重试')
    },
    async markVerified(version: number, verifiedHash: string) {
      if (!(await query('UPDATE assistant_settings SET verified_hash = ? WHERE id = 1 AND version = ? RETURNING id', [verifiedHash, integer(version)])).length)
        throw new AssistantError(409, 'settings_conflict', '助手设置已改变，请重新测试')
    },
    request,
    async admit(input: { id: string, actor: string, ipHash: string, conversationId: string, fingerprint: string, authenticated: boolean, kind?: 'conversation' | 'test', configVersion?: number }, settings: AssistantSettings, now: number) {
      const day = billingDay(now)
      const minute = input.authenticated ? settings.userMinute : settings.guestMinute
      const daily = input.authenticated ? settings.userDay : settings.guestDay
      const [inserted, , , existing] = await db.batch([
        {
          sql: `INSERT INTO assistant_requests (id,actor,ip_hash,conversation_id,fingerprint,day,created_at,lease_until,status)
            SELECT ?,?,?,?,?,?,?,?,'active'
            WHERE (SELECT COUNT(*) FROM assistant_requests WHERE actor = ? AND created_at > ?) < ?
              AND (SELECT COUNT(*) FROM assistant_requests WHERE actor = ? AND day = ?) < ?
              AND (SELECT COUNT(*) FROM assistant_requests WHERE ip_hash = ? AND created_at > ?) < ?
              AND (SELECT COUNT(*) FROM assistant_requests WHERE ip_hash = ? AND day = ?) < ?
              AND (SELECT COUNT(*) FROM assistant_requests WHERE actor = ? AND status IN ('active','waiting','cancelled') AND lease_until > ?) = 0
              AND (SELECT COUNT(*) FROM assistant_requests WHERE status IN ('active','waiting','cancelled') AND lease_until > ?) < ?
            ON CONFLICT DO NOTHING RETURNING id`,
          params: [input.id, input.actor, input.ipHash, input.conversationId, input.fingerprint, day, now, now + assistantLimits.turnMs + 5000, input.actor, now - 60_000, minute, input.actor, day, daily, input.ipHash, now - 60_000, settings.ipMinute, input.ipHash, day, settings.ipDay, input.actor, now, now, settings.concurrency],
        },
        { sql: `INSERT INTO assistant_tasks(id,kind,config_version,created_at,updated_at,deadline) SELECT ?,?,?,?,?,? WHERE changes() = 1`, params: [input.id, input.kind ?? 'conversation', input.configVersion ?? 0, now, now, now + assistantLimits.turnMs + 5000] },
        { sql: `INSERT INTO assistant_task_steps(id,task_id,stage,label,status,started_at,finished_at) SELECT ?,?,'task','请求校验与次数检查','completed',?,? WHERE changes() = 1`, params: [crypto.randomUUID(), input.id, now, now] },
        { sql: 'SELECT * FROM assistant_requests WHERE id = ? AND actor = ?', params: [input.id, input.actor] },
      ])
      if (inserted?.length) {
        return requestSchema.parse(existing?.[0])
      }
      if (existing?.length) {
        if (existing[0]?.fingerprint !== input.fingerprint)
          throw new AssistantError(409, 'request_conflict', '请求标识已使用，请重新提问')
        throw new AssistantError(409, 'duplicate_request', '该请求已处理或正在处理，请勿重复发送')
      }
      throw new AssistantError(429, 'request_limit', '当前请求较多或已达提问次数上限，请稍后再试')
    },
    async remaining(actor: string, limit: number, now: number) {
      const [row] = await query('SELECT COUNT(*) AS used FROM assistant_requests WHERE actor = ? AND day = ?', [actor, billingDay(now)])
      return Math.max(0, limit - z.number().parse(row?.used))
    },
    async assertActive(id: string, actor: string, now: number) {
      const row = await request(id, actor)
      if (!row || row.status !== 'active' || row.created_at + assistantLimits.turnMs <= now)
        throw new AssistantError(409, 'request_inactive', '本次回答已停止或超时，请重新提问')
      return row
    },
    async countCall(id: string, actor: string, kind: 'model' | 'tool' | 'history', now: number) {
      const columns = { model: 'model_calls', tool: 'tool_calls', history: 'history_calls' } as const
      const limits = { model: assistantLimits.modelCalls, tool: assistantLimits.toolCalls, history: assistantLimits.historyCalls }
      const column = columns[kind]
      const rows = await query(`UPDATE assistant_requests SET ${column} = ${column} + 1 WHERE id = ? AND actor = ? AND status = 'active' AND created_at > ? AND ${column} < ? RETURNING *`, [id, actor, now - assistantLimits.turnMs, limits[kind]])
      if (!rows.length)
        throw new AssistantError(429, 'call_limit', '本次处理达到上限，请缩小问题范围后重试')
      await tasks.count(id, kind)
      return requestSchema.parse(rows[0])
    },
    async end(id: string, actor: string, status: 'completed' | 'cancelled' | 'failed', error: TaskError | null = null, now = Date.now()) {
      const rows = await query('UPDATE assistant_requests SET status = ? WHERE id = ? AND actor = ? AND status IN (\'active\',\'waiting\') RETURNING id', [status, id, actor])
      if (rows.length)
        await tasks.finish(id, status, now, error)
    },
    async waitForHistory(id: string, actor: string, nonce: string, now: number) {
      const results = await db.batch([
        { sql: 'UPDATE assistant_requests SET status = \'waiting\' WHERE id = ? AND actor = ? AND status = \'active\' AND created_at > ? RETURNING id', params: [id, actor, now - assistantLimits.turnMs] },
        { sql: 'INSERT INTO assistant_continuations(nonce,request_id,actor,expires_at) SELECT ?,?,?,? WHERE changes() = 1', params: [nonce, id, actor, now + 60_000] },
      ])
      if (!results[0]?.length)
        throw new AssistantError(409, 'request_inactive', '本次回答已停止')
      await tasks.waiting(id, true, now)
    },
    async resume(id: string, actor: string, nonce: string, now: number) {
      const results = await db.batch([
        { sql: 'UPDATE assistant_continuations SET consumed = 1 WHERE nonce = ? AND request_id = ? AND actor = ? AND consumed = 0 AND expires_at > ? AND EXISTS (SELECT 1 FROM assistant_requests WHERE id = ? AND actor = ? AND status = \'waiting\' AND created_at > ?) RETURNING nonce', params: [nonce, id, actor, now, id, actor, now - assistantLimits.turnMs] },
        { sql: 'UPDATE assistant_requests SET status = \'active\' WHERE id = ? AND actor = ? AND status = \'waiting\' AND changes() = 1', params: [id, actor] },
      ])
      if (!results[0]?.length)
        throw new AssistantError(409, 'invalid_continuation', '继续对话的凭据已使用或失效，请重新提问')
      await tasks.waiting(id, false, now)
    },
    async createAction(input: { id: string, actor: string, conversationId: string, messageId: string, articleId: string, authorized: boolean }, now: number) {
      await db.batch([
        { sql: 'UPDATE assistant_actions SET status = \'cancelled\' WHERE actor = ? AND conversation_id = ? AND status IN (\'pending\',\'authorized\')', params: [input.actor, input.conversationId] },
        { sql: 'INSERT INTO assistant_actions(id,actor,conversation_id,message_id,article_id,created_at,expires_at,status) VALUES (?,?,?,?,?,?,?,?)', params: [input.id, input.actor, input.conversationId, input.messageId, input.articleId, now, now + 300_000, input.authorized ? 'authorized' : 'pending'] },
      ])
    },
    async action(id: string, actor: string, conversationId: string, now: number) {
      const [row] = await query('SELECT * FROM assistant_actions WHERE id = ? AND actor = ? AND conversation_id = ? AND expires_at > ?', [id, actor, conversationId, now])
      return row ? actionSchema.parse(row) : null
    },
    async authorizeAction(id: string, actor: string, conversationId: string, now: number) {
      const rows = await query('UPDATE assistant_actions SET status = \'authorized\' WHERE id = ? AND actor = ? AND conversation_id = ? AND status = \'pending\' AND expires_at > ? RETURNING id', [id, actor, conversationId, now])
      return !!rows.length
    },
    async cancelPendingActions(actor: string, conversationId: string) {
      await query('UPDATE assistant_actions SET status = \'cancelled\' WHERE actor = ? AND conversation_id = ? AND status IN (\'pending\',\'authorized\')', [actor, conversationId])
    },
    async claimAction(id: string, actor: string, conversationId: string, now: number, clicked: boolean) {
      // A click is an explicit user confirmation. Automatic claims require prior authorization.
      const [row] = await query('UPDATE assistant_actions SET status = \'claimed\' WHERE id = ? AND actor = ? AND conversation_id = ? AND expires_at > ? AND (status = \'authorized\' OR (? = 1 AND status = \'pending\')) RETURNING *', [id, actor, conversationId, now, Number(clicked)])
      if (!row)
        throw new AssistantError(409, 'action_expired', '此操作已完成或失效，请重新选择文章')
      return actionSchema.parse(row)
    },
    async actionResult(id: string, actor: string, conversationId: string, status: 'succeeded' | 'failed' | 'cancelled') {
      await query('UPDATE assistant_actions SET status = ? WHERE id = ? AND actor = ? AND conversation_id = ? AND status = \'claimed\'', [status, id, actor, conversationId])
    },
    async clean(now: number) {
      await tasks.maintain(now)
      const cutoff = now - 7 * 86_400_000
      const statements: Statement[] = [
        { sql: 'DELETE FROM assistant_continuations WHERE request_id IN (SELECT id FROM assistant_requests WHERE created_at < ?)', params: [cutoff] },
        { sql: 'DELETE FROM assistant_charges WHERE request_id IN (SELECT id FROM assistant_requests WHERE created_at < ?)', params: [cutoff] },
        { sql: 'DELETE FROM assistant_requests WHERE created_at < ?', params: [cutoff] },
        { sql: 'DELETE FROM assistant_actions WHERE created_at < ?', params: [cutoff] },
        { sql: 'DELETE FROM assistant_budget_resets WHERE day < ?', params: [billingDay(now - 30 * 86_400_000)] },
        { sql: 'DELETE FROM assistant_daily_usage WHERE day < ?', params: [billingDay(now - 30 * 86_400_000)] },
      ]
      await db.batch(statements)
    },
  }
}
export type AssistantRepository = ReturnType<typeof createAssistantRepository>
