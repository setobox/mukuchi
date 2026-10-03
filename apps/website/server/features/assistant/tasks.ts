import type { TaskError, TaskStage } from '../../../shared/assistant/tasks'
import type { AdminDatabase, SqlValue, Statement } from '../admin/database'
import { z } from 'zod'
import { AssistantError, assistantLimits } from '../../../shared/assistant/model'
import { taskDetailSchema, taskErrorSchema, taskQuerySchema, taskSchema } from '../../../shared/assistant/tasks'

const selectTask = `SELECT id,kind,config_version AS configVersion,status,stage,created_at AS createdAt,updated_at AS updatedAt,finished_at AS finishedAt,deadline,error,model_calls AS modelCalls,tool_calls AS toolCalls,history_calls AS historyCalls FROM assistant_tasks`
const selectSteps = `SELECT id,stage,label,status,started_at AS startedAt,finished_at AS finishedAt,error FROM assistant_task_steps`
const terminal = `status IN ('running','waiting')`
function parseError(value: unknown) {
  return typeof value === 'string' ? taskErrorSchema.parse(JSON.parse(value)) : null
}
export function taskFailure(cause: unknown, secrets: readonly string[] = []): TaskError {
  const known = cause instanceof AssistantError
  const details = z.object({ adminMessage: z.string().optional(), upstreamStatus: z.number().optional(), upstreamCode: z.string().optional(), requestId: z.string().optional() }).safeParse(cause)
  const metadata = known && details.success ? details.data : {}
  const clean = (value: string) => {
    let text = value
    for (const secret of secrets.filter(Boolean).sort((a, b) => b.length - a.length)) text = text.replaceAll(secret, '[已隐藏]')
    return text.replace(/Bearer\s+\S+|sk-[\w-]+|[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[已隐藏]').replace(/\p{Cc}/gu, ' ').slice(0, 1500)
  }
  return {
    code: known ? clean(cause.code) : 'internal_error',
    message: clean(metadata.adminMessage ?? (known ? cause.message : '服务内部处理失败，请结合任务标识检查服务端日志。')),
    status: known ? cause.statusCode : 503,
    upstreamStatus: metadata.upstreamStatus ?? null,
    upstreamCode: metadata.upstreamCode ? clean(metadata.upstreamCode) : null,
    requestId: metadata.requestId ? clean(metadata.requestId) : null,
  }
}
export function createTaskRepository(db: AdminDatabase) {
  const query = async (sql: string, params: SqlValue[] = []) => (await db.batch([{ sql, params }]))[0]!
  return {
    async start(id: string, kind: 'conversation' | 'test', version: number, now: number) {
      await query(`INSERT INTO assistant_tasks(id,kind,config_version,created_at,updated_at,deadline) VALUES(?,?,?,?,?,?) ON CONFLICT DO NOTHING`, [id, kind, version, now, now, now + assistantLimits.turnMs + 5000])
    },
    async begin(id: string, label: string, target: Exclude<TaskStage, 'done'>, now: number) {
      const stepId = crypto.randomUUID()
      const results = await db.batch([
        { sql: `UPDATE assistant_tasks SET stage = CASE WHEN stage = 'reply' THEN stage ELSE ? END,updated_at = ? WHERE id = ? AND ${terminal} RETURNING id`, params: [target, now, id] },
        { sql: `INSERT INTO assistant_task_steps(id,task_id,stage,label,status,started_at) SELECT ?,id,stage,?,'running',? FROM assistant_tasks WHERE id = ? AND changes() = 1`, params: [stepId, label, now, id] },
      ])
      return results[0]?.length ? stepId : null
    },
    async finishStep(stepId: string | null, now: number, error: TaskError | null = null) {
      if (stepId)
        await query(`UPDATE assistant_task_steps SET status = ?,finished_at = ?,error = ? WHERE id = ? AND status = 'running'`, [error ? 'failed' : 'completed', now, error ? JSON.stringify(error) : null, stepId])
    },
    async finish(id: string, status: 'completed' | 'failed' | 'cancelled', now: number, error: TaskError | null = null) {
      const encoded = error ? JSON.stringify(error) : null
      await db.batch([
        { sql: `UPDATE assistant_tasks SET status = ?,stage = CASE WHEN ? = 'completed' THEN 'done' ELSE stage END,finished_at = ?,updated_at = ?,error = ? WHERE id = ? AND ${terminal}`, params: [status, status, now, now, encoded, id] },
        { sql: `UPDATE assistant_task_steps SET status = ?,finished_at = ?,error = ? WHERE task_id = ? AND status = 'running' AND changes() > 0`, params: [status, now, encoded, id] },
      ])
    },
    async waiting(id: string, waiting: boolean, now: number) {
      await query(`UPDATE assistant_tasks SET status = ?,updated_at = ? WHERE id = ? AND ${terminal}`, [waiting ? 'waiting' : 'running', now, id])
    },
    async count(id: string, kind: 'model' | 'tool' | 'history') {
      const column = { model: 'model_calls', tool: 'tool_calls', history: 'history_calls' }[kind]
      await query(`UPDATE assistant_tasks SET ${column} = ${column} + 1 WHERE id = ? AND ${terminal}`, [id])
    },
    async maintain(now: number) {
      const error = JSON.stringify(taskFailure(new AssistantError(504, 'task_interrupted', '任务超过执行期限，可能已超时或服务中断。请重新发起任务。')))
      const cutoff = now - 30 * 86_400_000
      const statements: Statement[] = [
        { sql: `UPDATE assistant_task_steps SET status = 'failed',finished_at = (SELECT deadline FROM assistant_tasks WHERE id = task_id),error = ? WHERE status = 'running' AND task_id IN (SELECT id FROM assistant_tasks WHERE ${terminal} AND deadline <= ?)`, params: [error, now] },
        { sql: `UPDATE assistant_tasks SET status = 'failed',finished_at = deadline,updated_at = ?,error = ? WHERE ${terminal} AND deadline <= ?`, params: [now, error, now] },
        { sql: `UPDATE assistant_requests SET status = 'failed' WHERE status IN ('active','waiting') AND lease_until <= ?`, params: [now] },
        { sql: 'DELETE FROM assistant_task_steps WHERE task_id IN (SELECT id FROM assistant_tasks WHERE created_at < ?)', params: [cutoff] },
        { sql: 'DELETE FROM assistant_tasks WHERE created_at < ?', params: [cutoff] },
      ]
      await db.batch(statements)
    },
    async list(input: z.infer<typeof taskQuerySchema>) {
      const { page, pageSize, kind, status } = taskQuerySchema.parse(input)
      const where: string[] = []
      const params: SqlValue[] = []
      if (kind) {
        where.push('kind = ?')
        params.push(kind)
      }
      if (status) {
        where.push('status = ?')
        params.push(status)
      }
      const clause = where.length ? ` WHERE ${where.join(' AND ')}` : ''
      const [rows, counts] = await db.batch([
        { sql: `${selectTask}${clause} ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`, params: [...params, pageSize, (page - 1) * pageSize] },
        { sql: `SELECT COUNT(*) AS total FROM assistant_tasks${clause}`, params },
      ])
      return { tasks: (rows ?? []).map(row => taskSchema.parse({ ...row, error: parseError(row.error) })), total: z.number().parse(counts?.[0]?.total), page, pageSize }
    },
    async detail(id: string) {
      const [row] = await query(`${selectTask} WHERE id = ?`, [id])
      if (!row)
        throw new AssistantError(404, 'task_not_found', '任务记录不存在或已超过保留时间')
      const steps = await query(`${selectSteps} WHERE task_id = ? ORDER BY started_at,rowid`, [id])
      return taskDetailSchema.parse({ ...row, error: parseError(row.error), steps: steps.map(step => ({ ...step, error: parseError(step.error) })) })
    },
  }
}
