import type { AdminDatabase } from '../server/features/admin/database'
import type { AssistantRepository } from '../server/features/assistant/repository'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, expect, test } from 'vite-plus/test'
import { z } from 'zod'
import { seal, signTurn, unseal, verifyHistory } from '../server/features/assistant/crypto'
import { billingDay, createAssistantRepository } from '../server/features/assistant/repository'
import { assistantLimits } from '../shared/assistant/model'
import { defaultAssistantSettings } from '../shared/assistant/settings'

const secret = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
const databases: DatabaseSync[] = []
afterEach(() => {
  for (const db of databases.splice(0)) db.close()
})
function setup() {
  const db = new DatabaseSync(':memory:')
  databases.push(db)
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(readFileSync(new URL('../migrations/admin/0006_assistant.sql', import.meta.url), 'utf8'))
  db.exec(readFileSync(new URL('../migrations/admin/0007_assistant_budget.sql', import.meta.url), 'utf8'))
  db.exec(readFileSync(new URL('../migrations/admin/0008_runtime_settings_tasks.sql', import.meta.url), 'utf8'))
  const connection: AdminDatabase = {
    async batch(statements) {
      db.exec('BEGIN IMMEDIATE')
      try {
        const rows = statements.map(s => db.prepare(s.sql).all(...(s.params ?? [])) as Record<string, unknown>[])
        db.exec('COMMIT')
        return rows
      }
      catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    },
    close: () => {},
  }
  return { repository: createAssistantRepository(connection), db }
}
const now = Date.parse('2026-09-30T12:00:00Z')
async function admit(repository: AssistantRepository, actor = crypto.randomUUID(), at = now) {
  const value = { id: crypto.randomUUID(), actor, ipHash: `ip:${actor}`, conversationId: crypto.randomUUID(), fingerprint: 'digest', authenticated: false }
  await repository.admit(value, defaultAssistantSettings, at)
  return value
}
test('本地历史签名允许旧记录和 JSON 键重排，拒绝内容修改、角色伪造、跨账号／会话和乱序重放', async () => {
  const conversationId = crypto.randomUUID()
  const first = await signTurn(secret, 'a', {
    id: crypto.randomUUID(),
    conversationId,
    createdAt: 1,
    user: '我在学习 Vue',
    assistant: { id: crypto.randomUUID(), role: 'assistant', blocks: [{ type: 'text', text: '可以看看相关的文章。' }], references: [] },
  })
  const second = await signTurn(secret, 'a', { id: crypto.randomUUID(), conversationId, user: first.user, assistant: first.assistant, createdAt: 2 })
  expect(await verifyHistory(secret, 'a', conversationId, [{ ...first, assistant: { references: [], blocks: first.assistant.blocks, role: 'assistant', id: first.assistant.id } }, second])).toHaveLength(2)
  for (const [actor, id, values] of [
    ['b', conversationId, [first]],
    ['a', crypto.randomUUID(), [first]],
    ['a', conversationId, [{ ...first, user: '篡改' }]],
    ['a', conversationId, [second, first]],
    ['a', conversationId, [first, first]],
    ['a', conversationId, [{ ...first, assistant: { ...first.assistant, role: 'system' } }]],
  ] as const) {
    await expect(verifyHistory(secret, actor, id, values as Parameters<typeof verifyHistory>[3])).rejects.toMatchObject({ code: 'invalid_history' })
  }
})
test('续传加密绑定身份与用途，不在凭据中暴露明文，任何修改均失败', async () => {
  const shape = z.object({ text: z.string(), nonce: z.string(), expiresAt: z.number() }).strict()
  const value = { text: '这是用户的私有聊天记录', nonce: crypto.randomUUID(), expiresAt: now + 60_000 }
  const token = await seal(secret, 'actor:a', 'continuation', value)
  expect(token).not.toContain(value.text)
  expect(await unseal(secret, 'actor:a', 'continuation', token, shape)).toEqual(value)
  await expect(unseal(secret, 'actor:b', 'continuation', token, shape)).rejects.toThrow()
  await expect(unseal(secret, 'actor:a', 'cookie', token, shape)).rejects.toThrow()
  const tampered = `${token.slice(0, 20)}${token[20] === 'A' ? 'B' : 'A'}${token.slice(21)}`
  expect(tampered).not.toBe(token)
  await expect(unseal(secret, 'actor:a', 'continuation', tampered, shape)).rejects.toThrow()
})
test('配额原子限制身份、IP、全站并发；取消后租约等待最长处理期限', async () => {
  const { repository } = setup()
  const a = await admit(repository, 'a')
  await expect(admit(repository, 'a')).rejects.toMatchObject({ code: 'request_limit' })
  await expect(repository.admit(a, defaultAssistantSettings, now)).rejects.toMatchObject({ code: 'duplicate_request' })
  await expect(repository.admit({ ...a, fingerprint: 'different' }, defaultAssistantSettings, now)).rejects.toMatchObject({ code: 'request_conflict' })
  await repository.end(a.id, a.actor, 'cancelled')
  await expect(admit(repository, 'a', now + 60_000)).rejects.toMatchObject({ code: 'request_limit' })
  await expect(repository.assertActive(a.id, a.actor, now)).rejects.toMatchObject({ code: 'request_inactive' })
  const afterLease = now + assistantLimits.turnMs + 6000
  await expect(admit(repository, 'a', afterLease)).resolves.toBeDefined()
  await admit(repository, 'b', afterLease)
  await admit(repository, 'c', afterLease)
  await admit(repository, 'd', afterLease)
  await expect(admit(repository, 'e', afterLease)).rejects.toMatchObject({ code: 'request_limit' })
})
test('IP 额度不能用不同匿名身份绕过，每日额度按上海自然日结算', async () => {
  const { repository } = setup()
  const settings = { ...defaultAssistantSettings, ipMinute: 2, guestDay: 1 }
  const midnight = Date.parse('2026-09-30T16:00:00Z')
  const value = { id: crypto.randomUUID(), actor: 'a', ipHash: 'same', conversationId: crypto.randomUUID(), fingerprint: 'x', authenticated: false }
  await repository.admit(value, settings, midnight - 1)
  await repository.end(value.id, value.actor, 'completed')
  await expect(repository.admit({ ...value, id: crypto.randomUUID() }, settings, midnight - 1)).rejects.toThrow()
  const next = { ...value, id: crypto.randomUUID(), actor: 'b' }
  await repository.admit(next, settings, midnight - 1)
  await repository.end(next.id, next.actor, 'completed')
  await expect(repository.admit({ ...next, id: crypto.randomUUID(), actor: 'c' }, settings, midnight)).rejects.toThrow()
  await expect(repository.admit({ ...value, id: crypto.randomUUID() }, settings, midnight + 60_000)).resolves.toBeDefined()
  expect(billingDay(midnight - 1)).toBe('2026-09-30')
  expect(billingDay(midnight)).toBe('2026-10-01')
})
test('设置版本冲突不覆盖已保存的配置', async () => {
  const { repository } = setup()
  await repository.saveSettings(defaultAssistantSettings, 'encrypted', 0, 'verified')
  await expect(repository.saveSettings(defaultAssistantSettings, 'other', 0, 'verified')).rejects.toThrow()
  expect((await repository.settings()).verifiedHash).toBe('verified')
})

test('历史续传单次消费且绑定身份，请求到期后不能续传或追加收费调用', async () => {
  const { repository } = setup()
  const request = await admit(repository)
  const nonce = crypto.randomUUID()
  await repository.waitForHistory(request.id, request.actor, nonce, now)
  await expect(repository.resume(request.id, 'other', nonce, now)).rejects.toThrow()
  await repository.resume(request.id, request.actor, nonce, now + 1)
  await expect(repository.resume(request.id, request.actor, nonce, now + 1)).rejects.toThrow()
  const second = crypto.randomUUID()
  await repository.waitForHistory(request.id, request.actor, second, now + 1)
  await expect(repository.resume(request.id, request.actor, second, now + 60_002)).rejects.toThrow()
  await expect(repository.countCall(request.id, request.actor, 'model', now + assistantLimits.turnMs)).rejects.toThrow()
})
test('导航领取单次、跨会话隔离，新操作撤销旧操作；只有客户端回执改变成功状态', async () => {
  const { repository } = setup()
  const request = await admit(repository)
  const input = { id: crypto.randomUUID(), actor: request.actor, conversationId: request.conversationId, messageId: crypto.randomUUID(), articleId: '/posts/a', authorized: false }
  await repository.createAction(input, now)
  await expect(repository.claimAction(input.id, input.actor, input.conversationId, now, false)).rejects.toThrow()
  await expect(repository.claimAction(input.id, 'other', input.conversationId, now, true)).rejects.toThrow()
  await repository.authorizeAction(input.id, input.actor, input.conversationId, now)
  expect((await repository.claimAction(input.id, input.actor, input.conversationId, now, false)).status).toBe('claimed')
  await expect(repository.claimAction(input.id, input.actor, input.conversationId, now, true)).rejects.toThrow()
  await repository.actionResult(input.id, input.actor, input.conversationId, 'succeeded')
  expect((await repository.action(input.id, input.actor, input.conversationId, now))?.status).toBe('succeeded')
  const pending = { ...input, id: crypto.randomUUID() }
  await repository.createAction(pending, now)
  await repository.createAction({ ...input, id: crypto.randomUUID() }, now)
  expect((await repository.action(pending.id, input.actor, input.conversationId, now))?.status).toBe('cancelled')
})
test('元数据清理保留任务历史，表结构不允许聊天正文持久化', async () => {
  const { repository, db } = setup()
  const request = await admit(repository)
  await repository.clean(now + 8 * 86_400_000)
  expect(await repository.request(request.id, request.actor)).toBeNull()
  expect((await repository.tasks.detail(request.id)).status).toBe('failed')
  for (const table of ['assistant_requests', 'assistant_tasks', 'assistant_task_steps', 'assistant_actions', 'assistant_continuations']) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all().map(row => row.name)
    for (const column of ['prompt', 'response', 'content', 'text']) expect(columns).not.toContain(column)
  }
})
