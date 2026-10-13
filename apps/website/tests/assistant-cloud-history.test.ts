import type { TurnRequest } from '../shared/assistant/model'
import { afterEach, expect, test } from 'vite-plus/test'
import { signTurn, verifyHistory } from '../server/features/assistant/crypto'
import { defaultAssistantSettings } from '../shared/assistant/settings'
import { assistantDatabase } from './fixtures/assistant-database'

const secret = btoa('a'.repeat(32))
const connections: ReturnType<typeof assistantDatabase>[] = []
afterEach(() => {
  for (const item of connections.splice(0)) item.connection.close()
})
function setup() {
  const item = assistantDatabase()
  connections.push(item)
  return item.repository
}
function request(): TurnRequest {
  return { requestId: crypto.randomUUID(), conversationId: crypto.randomUUID(), text: '介绍文章', page: { path: '/posts/a' }, history: [] }
}
async function record(input = request(), actor = 'account:a', createdAt = Date.now()) {
  return signTurn(secret, actor, { id: input.requestId, conversationId: input.conversationId, createdAt, user: input.text, assistant: { id: crypto.randomUUID(), role: 'assistant', blocks: [{ type: 'text', text: '文章内容' }], references: [] } })
}
async function begin(repo: ReturnType<typeof setup>, input: TurnRequest, now: number) {
  await repo.admit({ id: input.requestId, actor: 'account:a', ipHash: 'ip', fingerprint: 'fixture', conversationId: input.conversationId, authenticated: true }, defaultAssistantSettings, now)
  await repo.history.begin('account:a', input, now)
}

test('账号完成回答和成功额度一同持久化，重复完成／取消不会重复扣次；清理日志保留正文', async () => {
  const repo = setup()
  const input = request()
  const now = Date.now()
  await begin(repo, input, now)
  expect((await repo.history.messages('account:a', input.conversationId, null)).messages[0]?.status).toBe('pending')
  expect(await repo.remaining('account:a', 50, now)).toBe(50)
  await repo.countCall(input.requestId, 'account:a', 'model', now)
  await repo.countCall(input.requestId, 'account:a', 'model', now)
  await repo.complete('account:a', await record(input), now + 1)
  await repo.end(input.requestId, 'account:a', 'cancelled')
  await expect(repo.complete('account:a', await record(input), now + 2)).rejects.toMatchObject({ code: 'request_inactive' })
  expect(await repo.remaining('account:a', 50, now)).toBe(49)
  const detail = await repo.history.messages('account:a', input.conversationId, null)
  expect(detail.messages[0]).toMatchObject({ status: 'completed', record: { user: input.text } })
  expect(await repo.history.get('account:b', input.conversationId)).toBeNull()
  await repo.clean(now + 40 * 86_400_000)
  expect((await repo.history.messages('account:a', input.conversationId, null)).messages).toHaveLength(1)
})

test.each(['cancelled', 'failed'] as const)('%s 先到时拒绝迟到完成并释放当日名额', async (status) => {
  const repo = setup()
  const input = request()
  const now = Date.now()
  await begin(repo, input, now)
  await repo.countCall(input.requestId, 'account:a', 'model', now)
  await repo.end(input.requestId, 'account:a', status)
  await expect(repo.complete('account:a', await record(input), now + 1)).rejects.toMatchObject({ code: 'request_inactive' })
  expect(await repo.remaining('account:a', 50, now)).toBe(50)
  expect((await repo.history.messages('account:a', input.conversationId, null)).messages[0]?.status).toBe(status)
})

test('无需模型的完成不扣额度，跨北京时间午夜按请求所属日结算', async () => {
  const repo = setup()
  const midnight = Date.parse('2026-10-10T16:00:00Z')
  const input = request()
  await begin(repo, input, midnight - 1)
  await repo.complete('account:a', await record(input), midnight + 1)
  expect(await repo.remaining('account:a', 50, midnight - 1)).toBe(50)
  const next = request()
  await begin(repo, next, midnight + 2)
  await repo.countCall(next.requestId, 'account:a', 'model', midnight + 2)
  await repo.complete('account:a', await record(next), midnight + 3)
  expect(await repo.remaining('account:a', 50, midnight + 3)).toBe(49)
  expect(await repo.remaining('account:a', 50, midnight - 1)).toBe(50)
})

test('导入按消息 ID 幂等、游客归属唯一，删除标记拒绝旧设备回写且只有最新版本可撤销', async () => {
  const repo = setup()
  const signed = await record()
  const first = await repo.history.import('account:a', 'anonymous:guest', signed.conversationId, [signed])
  const repeated = await repo.history.import('account:a', 'anonymous:guest', signed.conversationId, [signed])
  expect(repeated.syncVersion).toBe(first.syncVersion)
  expect((await repo.history.messages('account:a', signed.conversationId, null)).messages).toHaveLength(1)
  await expect(repo.history.import('account:b', 'anonymous:guest', signed.conversationId, [signed])).rejects.toMatchObject({ code: 'history_claimed' })
  await expect(repo.history.remove('account:a', signed.conversationId, first.version - 1)).rejects.toMatchObject({ code: 'history_conflict' })
  const deleted = (await repo.history.remove('account:a', signed.conversationId, first.version))!
  expect((await repo.history.messages('account:a', signed.conversationId, null)).messages).toEqual([])
  await expect(repo.history.import('account:a', 'account:a', signed.conversationId, [signed])).rejects.toMatchObject({ code: 'history_deleted' })
  await expect(repo.history.restore('account:a', signed.conversationId, first.version, [signed])).rejects.toMatchObject({ code: 'history_conflict' })
  await repo.history.restore('account:a', signed.conversationId, deleted.version, [signed])
  expect((await repo.history.messages('account:a', signed.conversationId, null)).messages[0]?.record).toEqual(signed)
  await expect(repo.history.restore('account:a', signed.conversationId, deleted.version, [signed])).rejects.toThrow()
  expect(await repo.remaining('account:a', 50, Date.now())).toBe(50)
})

test('未完成问题可以同步和撤销，但不带可信签名；清空后禁止导入复活', async () => {
  const repo = setup()
  const input = request()
  const archived = { id: input.requestId, createdAt: Date.now(), user: input.text, page: input.page, status: 'interrupted' as const }
  const imported = await repo.history.import('account:a', 'anonymous:guest', input.conversationId, [], [archived])
  expect((await repo.history.messages('account:a', input.conversationId, null)).messages[0]?.record).toBeUndefined()
  const deleted = (await repo.history.remove('account:a', input.conversationId, imported.version))!
  await repo.history.restore('account:a', input.conversationId, deleted.version, [], [archived])
  expect((await repo.history.messages('account:a', input.conversationId, null)).messages[0]?.status).toBe('interrupted')
  await repo.history.clear('account:a')
  await expect(repo.history.import('account:a', 'anonymous:guest', input.conversationId, [], [archived])).rejects.toThrow()
})

test('游客记录经过原匿名身份验证后重新签名，篡改和跨身份签名不能导入可信历史', async () => {
  const input = request()
  const guest = await record(input, 'anonymous:guest')
  const [verified] = await verifyHistory(secret, 'anonymous:guest', input.conversationId, [guest])
  const { proof: _proof, ...value } = verified!
  const account = await signTurn(secret, 'account:a', value)
  expect(await verifyHistory(secret, 'account:a', input.conversationId, [account])).toHaveLength(1)
  await expect(verifyHistory(secret, 'account:b', input.conversationId, [account])).rejects.toThrow()
  await expect(verifyHistory(secret, 'anonymous:guest', input.conversationId, [{ ...guest, user: '篡改' }])).rejects.toThrow()
})

test('回答持久化失败时回滚成功终态和扣次，分页读取全部消息且会话版本稳定', async () => {
  const item = assistantDatabase()
  connections.push(item)
  const repo = item.repository
  const input = request()
  const now = Date.now()
  await begin(repo, input, now)
  await repo.countCall(input.requestId, 'account:a', 'model', now)
  item.db.exec('CREATE TRIGGER reject_completion BEFORE UPDATE OF record ON assistant_messages BEGIN SELECT RAISE(ABORT, \'fixture\'); END')
  await expect(repo.complete('account:a', await record(input), now + 1)).rejects.toThrow('fixture')
  expect(await repo.remaining('account:a', 50, now)).toBe(50)
  expect((await repo.request(input.requestId, 'account:a'))?.status).toBe('active')
  item.db.exec('DROP TRIGGER reject_completion')
  await repo.complete('account:a', await record(input), now + 2)
  for (let index = 0; index < 24; index++) {
    const next = await record({ ...input, requestId: crypto.randomUUID() }, 'account:a', now + index + 3)
    await repo.history.import('account:a', 'account:a', input.conversationId, [next])
  }
  const first = await repo.history.messages('account:a', input.conversationId, null)
  expect(first.messages).toHaveLength(20)
  expect(first.next).not.toBeNull()
  const second = await repo.history.messages('account:a', input.conversationId, first.next)
  expect(second.messages).toHaveLength(5)
  expect(second.next).toBeNull()
  expect(second.conversation.version).toBe(first.conversation.version)
  expect(new Set([...first.messages, ...second.messages].map(turn => turn.id)).size).toBe(25)
})
