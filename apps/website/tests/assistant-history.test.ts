import type { Conversation, LocalTurn } from '../app/features/assistant/local-model'
import type { LocalDatabase } from '../app/features/assistant/storage'
import type { SignedTurn } from '../shared/assistant/model'
import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, test, vi } from 'vite-plus/test'
import { createLocalHistory } from '../app/features/assistant/history'
import { conversationTitle, groupConversations } from '../app/features/assistant/local-model'
import { LocalHistoryConflict, memoryHistoryDatabase, openHistoryDatabase, resilientHistoryDatabase } from '../app/features/assistant/storage'

function pending(namespace = 'anonymous:a', conversationId = crypto.randomUUID()): LocalTurn {
  return { namespace, conversationId, id: crypto.randomUUID(), createdAt: Date.now(), user: '解释这篇文章', page: { path: '/posts/a' }, status: 'pending' }
}
function completed(turn: LocalTurn): SignedTurn {
  return { id: turn.id, conversationId: turn.conversationId, user: turn.user, createdAt: turn.createdAt, proof: 'test-proof', assistant: { id: crypto.randomUUID(), role: 'assistant', blocks: [{ type: 'text', text: '文章介绍了 Vue。' }], references: [] } }
}

describe.each(['indexeddb', 'memory'] as const)('%s 会话行为', (kind) => {
  async function setup() {
    const factory = new IDBFactory()
    const db = kind === 'indexeddb' ? await openHistoryDatabase(factory) : memoryHistoryDatabase()
    return { db, factory, history: createLocalHistory(db) }
  }
  test('历史不按年龄过期，刷新可恢复；账号、匿名分区隔离', async () => {
    const { history, db, factory } = await setup()
    const turn = pending()
    turn.createdAt = new Date(2000, 0, 1).getTime()
    await history.append(turn, null)
    await history.finish(turn.namespace, turn.conversationId, turn.id, { status: 'completed', record: completed(turn) }, true, turn.createdAt)
    expect(await history.list('account:b')).toEqual([])
    expect(await history.messages('account:b', turn.conversationId)).toEqual([])
    const restored = kind === 'indexeddb' ? createLocalHistory(await openHistoryDatabase(factory)) : history
    expect(await restored.list(turn.namespace)).toHaveLength(1)
    expect((await restored.messages(turn.namespace, turn.conversationId))[0]?.record).toEqual(expect.objectContaining({ user: turn.user, id: turn.id }))
    expect(await restored.recent(turn.namespace)).toBe(turn.conversationId)
    await restored.select(turn.namespace, turn.conversationId)
    expect((await restored.list(turn.namespace))[0]?.unread).toBe(false)
    restored.close()
    db.close()
  })
  test('删除正文、保留防复活标识；撤销后也不接受删除前的迟到响应', async () => {
    const { history } = await setup()
    const turn = pending()
    const row = await history.append(turn, null)
    const removed = await history.remove(turn.namespace, row.id)
    expect(removed).not.toBeNull()
    expect(await history.messages(turn.namespace, row.id)).toEqual([])
    expect(await history.list(turn.namespace)).toEqual([])
    expect(await history.finish(turn.namespace, row.id, turn.id, { status: 'completed', record: completed(turn) }, true)).toBe(false)
    await expect(history.append(pending(turn.namespace, row.id), row.version)).rejects.toThrow(LocalHistoryConflict)
    await expect(history.append(pending(turn.namespace, row.id), null)).rejects.toThrow(LocalHistoryConflict)
    expect(await history.undo(removed!)).toBe(true)
    expect((await history.messages(turn.namespace, row.id))[0]?.status).toBe('cancelled')
    expect(await history.finish(turn.namespace, row.id, turn.id, { status: 'completed', record: completed(turn) }, true)).toBe(false)
    expect(await history.undo(removed!)).toBe(false)
    history.close()
  })
  test('清空当前身份后撤销失效，不删除其他账号；重放完成事件不覆盖原回复', async () => {
    const { history } = await setup()
    const a = pending()
    const b = pending('account:b')
    await history.append(a, null)
    await history.append(b, null)
    const removed = await history.remove(a.namespace, a.conversationId)
    await history.clear(a.namespace)
    expect(await history.undo(removed!)).toBe(false)
    expect(await history.list(b.namespace)).toHaveLength(1)
    expect(await history.finish(b.namespace, b.conversationId, b.id, { status: 'completed', record: completed(b) }, false)).toBe(true)
    expect(await history.finish(b.namespace, b.conversationId, b.id, { status: 'failed' }, false)).toBe(false)
    expect((await history.messages(b.namespace, b.conversationId))[0]?.status).toBe('completed')
    history.close()
  })
  test('并行追加只有一个版本匹配；超时中断不误伤另一标签页的活动任务', async () => {
    const { history } = await setup()
    const turn = pending()
    const row = await history.append(turn, null)
    const results = await Promise.allSettled([history.append(pending(turn.namespace, row.id), row.version), history.append(pending(turn.namespace, row.id), row.version)])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect(await history.interruptExpired(turn.namespace, turn.createdAt - 1)).toBe(0)
    expect(await history.interruptExpired(turn.namespace, Date.now() + 1)).toBe(2)
    expect((await history.messages(turn.namespace, row.id)).every(t => t.status === 'interrupted')).toBe(true)
    history.close()
  })
  test('事务抛错时不保留部分写入', async () => {
    const { db } = await setup()
    await expect(db.run(true, async (tx) => {
      await tx.put('preferences', { namespace: 'a', id: 'lastConversation', value: null })
      throw new LocalHistoryConflict()
    })).rejects.toThrow(LocalHistoryConflict)
    expect(await db.run(false, tx => tx.all('preferences', 'a'))).toEqual([])
    db.close()
  })
})

test('跨标签页删除可见，旧窗口不复活消息', async () => {
  const factory = new IDBFactory()
  const one = createLocalHistory(await openHistoryDatabase(factory))
  const two = createLocalHistory(await openHistoryDatabase(factory))
  const turn = pending()
  await one.append(turn, null)
  await two.remove(turn.namespace, turn.conversationId)
  expect(await one.finish(turn.namespace, turn.conversationId, turn.id, { status: 'completed', record: completed(turn) }, true)).toBe(false)
  expect(await one.list(turn.namespace)).toEqual([])
  one.close()
  two.close()
})

test('容量不足时提示并保留当前页面内存，磁盘旧记录不被清理', async () => {
  const underlying = memoryHistoryDatabase()
  let fail = false
  const disk: LocalDatabase = {
    run: (write, operation) => {
      if (write && fail)
        return Promise.reject(new DOMException('full', 'QuotaExceededError'))
      return underlying.run(write, operation)
    },
    close: () => {},
  }
  const warn = vi.fn()
  const history = createLocalHistory(resilientHistoryDatabase(disk, warn))
  const turn = pending()
  await history.append(turn, null)
  fail = true
  await history.finish(turn.namespace, turn.conversationId, turn.id, { status: 'completed', record: completed(turn) }, true)
  expect(warn).toHaveBeenCalledTimes(1)
  expect((await history.messages(turn.namespace, turn.conversationId))[0]?.status).toBe('completed')
  expect((await createLocalHistory(underlying).messages(turn.namespace, turn.conversationId))[0]?.status).toBe('pending')
  await history.clear(turn.namespace)
  expect(await createLocalHistory(underlying).list(turn.namespace)).toHaveLength(1)
})

test('今天、此前六个自然日和更早的会话按活动时间分组；午夜重新计算、空组隐藏', () => {
  const now = new Date(2026, 8, 30, 12)
  const at = (day: number, hour = 0): Conversation => ({ id: crypto.randomUUID(), namespace: 'a', title: '会话', createdAt: 0, updatedAt: new Date(2026, 8, day, hour).getTime(), version: 0, unread: false, deleted: false })
  const today = at(30)
  const yesterday = at(29, 23)
  const sixth = at(24)
  const earlier = at(23, 23)
  expect(groupConversations([earlier, sixth, today, yesterday], now).map(g => [g.label, g.items.map(t => t.id)])).toEqual([
    ['今天', [today.id]],
    ['7天内', [yesterday.id, sixth.id]],
    ['7天前', [earlier.id]],
  ])
  expect(groupConversations([today], new Date(2026, 9, 1))[0]?.label).toBe('7天内')
  expect(groupConversations([{ ...today, deleted: true }], now)).toEqual([])
  expect(conversationTitle('😀'.repeat(25))).toBe('😀'.repeat(24))
})
