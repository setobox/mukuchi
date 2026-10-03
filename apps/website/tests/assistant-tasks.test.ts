import { expect, test } from 'vite-plus/test'
import { taskFailure } from '../server/features/assistant/tasks'
import { AssistantError, assistantLimits } from '../shared/assistant/model'
import { defaultAssistantSettings } from '../shared/assistant/settings'
import { assistantDatabase } from './fixtures/assistant-database'

const now = Date.parse('2026-10-02T08:00:00Z')
const input = () => ({ id: crypto.randomUUID(), actor: crypto.randomUUID(), ipHash: 'ip', conversationId: crypto.randomUUID(), fingerprint: 'digest', authenticated: false, configVersion: 3 })

test('任务记录阶段、耗时和调用次数；等待续传保持同一任务，终态拒绝迟到更新', async () => {
  const { repository: repo, connection } = assistantDatabase()
  try {
    const request = input()
    await repo.admit(request, defaultAssistantSettings, now)
    const audit = await repo.tasks.begin(request.id, '输入审核', 'review', now + 10)
    await repo.tasks.finishStep(audit, now + 30)
    const model = await repo.tasks.begin(request.id, '模型调用', 'reply', now + 30)
    await repo.countCall(request.id, request.actor, 'model', now + 31)
    await repo.tasks.finishStep(model, now + 50)
    const nonce = crypto.randomUUID()
    await repo.waitForHistory(request.id, request.actor, nonce, now + 51)
    expect((await repo.tasks.detail(request.id)).status).toBe('waiting')
    await repo.resume(request.id, request.actor, nonce, now + 52)
    const output = await repo.tasks.begin(request.id, '输出审核', 'review', now + 60)
    expect((await repo.tasks.detail(request.id)).stage).toBe('reply')
    await repo.end(request.id, request.actor, 'failed', taskFailure(new AssistantError(503, 'moderation_unavailable', '审核暂不可用')), now + 80)
    await repo.tasks.finishStep(output, now + 100)
    await repo.end(request.id, request.actor, 'completed', null, now + 100)
    const task = await repo.tasks.detail(request.id)
    expect(task).toMatchObject({ status: 'failed', stage: 'reply', configVersion: 3, finishedAt: now + 80, modelCalls: 1 })
    expect(task.steps.at(-1)).toMatchObject({ status: 'failed', startedAt: now + 60, finishedAt: now + 80 })
    expect(await repo.tasks.list({ page: 1, pageSize: 20, status: 'failed', kind: 'conversation' })).toMatchObject({ total: 1 })
  }
  finally { connection.close() }
})

test('取消、执行期限与 30 天清理；限流记录独立清理且不删除近期历史', async () => {
  const { repository: repo, connection } = assistantDatabase()
  try {
    const a = input()
    const b = input()
    await repo.admit(a, defaultAssistantSettings, now)
    await repo.admit({ ...b, kind: 'test' }, defaultAssistantSettings, now + 1)
    await repo.tasks.begin(a.id, '模型调用', 'reply', now + 5)
    await repo.end(b.id, b.actor, 'cancelled', null, now + 10)
    await repo.tasks.maintain(now + assistantLimits.turnMs + 5001)
    expect(await repo.tasks.detail(a.id)).toMatchObject({ status: 'failed', error: { code: 'task_interrupted' } })
    expect(await repo.tasks.detail(b.id)).toMatchObject({ status: 'cancelled', kind: 'test' })
    await repo.clean(now + 8 * 86_400_000)
    expect(await repo.request(a.id, a.actor)).toBeNull()
    expect((await repo.tasks.list({ page: 1, pageSize: 1 })).total).toBe(2)
    await repo.tasks.maintain(now + 31 * 86_400_000)
    expect((await repo.tasks.list({ page: 1, pageSize: 20 })).total).toBe(0)
  }
  finally { connection.close() }
})

test('失败诊断脱敏且不序列化未知异常、聊天正文或凭据', () => {
  const error = Object.assign(new AssistantError(503, 'test', 'token actual-secret / sk-private / someone@example.com'), { prompt: 'PRIVATE_CHAT', credentials: 'PRIVATE_KEY', upstreamStatus: 403, requestId: 'request-123' })
  const output = JSON.stringify(taskFailure(error, ['actual-secret']))
  for (const value of ['actual-secret', 'sk-private', 'someone@example.com', 'PRIVATE_CHAT', 'PRIVATE_KEY']) expect(output).not.toContain(value)
  expect(output).toContain('request-123')
  expect(taskFailure(new Error('PRIVATE_CHAT')).message).not.toContain('PRIVATE_CHAT')
})
