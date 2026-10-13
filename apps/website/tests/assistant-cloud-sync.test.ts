import type { HistoryRequest } from '../app/features/assistant/cloud-sync'
import type { AssistantSession, SignedTurn } from '../shared/assistant/model'
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { syncCloudHistory } from '../app/features/assistant/cloud-sync'
import { createAssistantController } from '../app/features/assistant/controller'
import { createLocalHistory } from '../app/features/assistant/history'
import { memoryHistoryDatabase } from '../app/features/assistant/storage'
import { signTurn, verifyHistory } from '../server/features/assistant/crypto'
import { historyImportSchema, historyMutationSchema, historyRestoreSchema } from '../shared/assistant/history'
import { assistantDatabase } from './fixtures/assistant-database'

const secret = btoa('a'.repeat(32))
const identity: AssistantSession = { enabled: true, authenticated: true, namespace: 'account:a', csrf: 'csrf', remaining: 50, dailyLimit: 50, inputLimit: 500, turnstileSiteKey: '' }
const connections: ReturnType<typeof assistantDatabase>[] = []
afterEach(() => {
  for (const item of connections.splice(0)) item.connection.close()
})
const local = () => createLocalHistory(memoryHistoryDatabase())
function setup() {
  const item = assistantDatabase()
  connections.push(item)
  const repo = item.repository.history
  const request: HistoryRequest = vi.fn(async (path, method, body) => {
    const url = new URL(path, 'https://fixture.test')
    if (url.pathname === '/conversations/import') {
      const input = historyImportSchema.parse(body)
      const source = input.source === 'anonymous' ? 'anonymous:guest' : identity.namespace
      const verified = await verifyHistory(secret, source, input.conversationId, input.records)
      const records = await Promise.all(verified.map(({ proof: _proof, ...value }) => signTurn(secret, identity.namespace, value)))
      return { conversation: await repo.import(identity.namespace, source, input.conversationId, records, input.messages) }
    }
    if (url.pathname === '/conversations') {
      if (method === 'DELETE') {
        await repo.clear(identity.namespace)
        return { cleared: true }
      }
      return repo.list(identity.namespace, url.searchParams.get('cursor'))
    }
    const id = url.pathname.split('/')[2]!
    if (method === 'DELETE')
      return { conversation: await repo.remove(identity.namespace, id, historyMutationSchema.parse(body).version) }
    if (url.pathname.endsWith('/restore')) {
      const input = historyRestoreSchema.parse(body)
      await verifyHistory(secret, identity.namespace, id, input.records)
      return { conversation: await repo.restore(identity.namespace, id, input.version, input.records, input.messages) }
    }
    return repo.messages(identity.namespace, id, url.searchParams.get('cursor'))
  })
  return { repo, request }
}
async function seed(history: ReturnType<typeof local>, namespace = 'anonymous', actor = 'anonymous:guest', invalid = false) {
  const conversationId = crypto.randomUUID()
  const id = crypto.randomUUID()
  await history.append({ id, conversationId, namespace, createdAt: 1, user: '游客问题', page: { path: null }, status: 'pending' }, null)
  const record: SignedTurn = await signTurn(secret, actor, { id, conversationId, createdAt: 1, user: '游客问题', assistant: { id: crypto.randomUUID(), role: 'assistant', blocks: [{ type: 'text', text: '完整回答' }], references: [] } })
  await history.finish(namespace, conversationId, id, { status: 'completed', record: invalid ? { ...record, proof: 'invalid' } : record }, false)
  const row = await history.snapshot(namespace, conversationId)
  await history.append({ id: crypto.randomUUID(), conversationId, namespace, createdAt: 2, user: '后续问题', page: { path: null }, status: 'pending' }, row!.version)
  const pending = (await history.messages(namespace, conversationId)).at(-1)!
  await history.finish(namespace, conversationId, pending.id, { status: 'interrupted', preview: { id: pending.id, role: 'assistant', blocks: [{ type: 'text', text: '本地部分正文' }], references: [] } }, false)
  return conversationId
}

test('登录自动迁移完整和未完成历史、重签账号记录并保留本地部分正文；第二台设备读取云端终态', async () => {
  const { request } = setup()
  const first = local()
  const id = await seed(first)
  await syncCloudHistory({ history: first, request, identity, valid: () => true, importLocal: true })
  expect(await first.list('anonymous')).toEqual([])
  const migrated = await first.messages(identity.namespace, id)
  expect(migrated).toHaveLength(2)
  expect(migrated[1]).toMatchObject({ status: 'interrupted', preview: { blocks: [{ text: '本地部分正文' }] } })
  expect(migrated[1]?.record).toBeUndefined()
  await verifyHistory(secret, identity.namespace, id, [migrated[0]!.record!])
  const second = local()
  await syncCloudHistory({ history: second, request, identity, valid: () => true, importLocal: true })
  expect((await second.messages(identity.namespace, id)).map(turn => turn.status)).toEqual(['completed', 'interrupted'])
  expect((await second.messages(identity.namespace, id))[1]?.preview).toBeUndefined()
  await syncCloudHistory({ history: first, request, identity, valid: () => true, importLocal: true })
  expect((await first.messages(identity.namespace, id))).toHaveLength(2)
})

test('无效签名或网络失败保留游客副本并提示，恢复联网后可重试', async () => {
  const { request } = setup()
  const history = local()
  const id = await seed(history, 'anonymous', 'anonymous:guest', true)
  await expect(syncCloudHistory({ history, request, identity, valid: () => true, importLocal: true })).rejects.toThrow('仍保存在此浏览器')
  expect(await history.messages('anonymous', id)).toHaveLength(2)
  const retry = local()
  const validId = await seed(retry)
  await expect(syncCloudHistory({ history: retry, request: async () => {
    throw new Error('offline')
  }, identity, valid: () => true, importLocal: true })).rejects.toThrow()
  expect(await retry.messages('anonymous', validId)).toHaveLength(2)
  await syncCloudHistory({ history: retry, request, identity, valid: () => true, importLocal: true })
  expect(await retry.list('anonymous')).toEqual([])
})

test('切换身份后迟到列表不会写入缓存或选择历史；默认打开仍为新会话', async () => {
  const { request } = setup()
  const history = local()
  await seed(history, identity.namespace, identity.namespace)
  const controller = createAssistantController({ history: Promise.resolve(history), transport: { history: request, session: async () => identity, post: vi.fn() }, navigate: vi.fn() })
  await controller.refreshSession()
  expect(controller.turns.value).toEqual([])
  const fresh = controller.currentId.value
  await controller.open()
  expect(controller.currentId.value).toBe(fresh)
  const pending = Promise.withResolvers<unknown>()
  let valid = true
  const other = local()
  const syncing = syncCloudHistory({ history: other, request: () => pending.promise, identity, valid: () => valid, importLocal: false })
  valid = false
  pending.resolve(await request('/conversations', 'GET'))
  await syncing
  expect(await other.list(identity.namespace)).toEqual([])
  controller.dispose()
})

test('云端删除、同步墓碑再撤销可恢复长会话；旧设备同步不能复活已删除记录', async () => {
  const { repo, request } = setup()
  const history = local()
  const id = await seed(history, identity.namespace, identity.namespace)
  const controller = createAssistantController({ history: Promise.resolve(history), transport: { history: request, session: async () => identity, post: vi.fn() }, navigate: vi.fn() })
  await controller.refreshSession()
  await controller.select(id)
  await controller.remove(id)
  expect((await repo.get(identity.namespace, id))?.deleted).toBe(true)
  expect(await history.list(identity.namespace)).toEqual([])
  await controller.undo()
  expect(controller.currentId.value).toBe(id)
  expect(controller.turns.value).toHaveLength(2)
  expect(controller.turns.value[1]?.preview?.blocks[0]).toMatchObject({ text: '本地部分正文' })
  await controller.remove(id)
  const oldDevice = local()
  await syncCloudHistory({ history: oldDevice, request, identity, valid: () => true, importLocal: false })
  expect(await oldDevice.list(identity.namespace)).toEqual([])
  controller.dispose()
})
