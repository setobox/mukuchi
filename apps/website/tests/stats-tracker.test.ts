import { randomUUID } from 'node:crypto'
import { expect, test, vi } from 'vite-plus/test'
import { createPageviewTracker, ensureVisitorCookie } from '../app/features/stats/tracker'

const result = { summary: { pageViews: 1, visitors: 1, startedAt: null }, page: { path: '/posts', pageViews: 1 } }
function fixture() {
  const send = vi.fn().mockResolvedValue(result)
  const publish = vi.fn()
  const fail = vi.fn()
  const wait = vi.fn().mockResolvedValue(undefined)
  return { send, publish, fail, wait, tracker: createPageviewTracker({ send, publish, fail, wait, makeId: randomUUID }) }
}

test('重复完成钩子不重复上报，离开返回与浏览器缓存恢复各新增一次', async () => {
  const { tracker, send } = fixture()
  await tracker.open('/posts')
  await tracker.open('/posts')
  await tracker.open('/posts/')
  await tracker.open('/about')
  await tracker.open('/posts')
  await tracker.open('/posts', true)
  expect(send).toHaveBeenCalledTimes(4)
  expect(new Set(send.mock.calls.map(call => call[0].eventId)).size).toBe(4)
})

test('短暂失败仅重试一次并复用事件 ID，客户端错误不重试', async () => {
  const { tracker, send, publish } = fixture()
  send.mockRejectedValueOnce({ statusCode: 503 })
  await tracker.open('/posts')
  expect(send).toHaveBeenCalledTimes(2)
  expect(send.mock.calls[0]?.[0]).toEqual(send.mock.calls[1]?.[0])
  expect(publish).toHaveBeenCalledOnce()
  send.mockRejectedValue({ statusCode: 404 })
  await tracker.open('/unknown')
  expect(send).toHaveBeenCalledTimes(3)
})

test('晚到的响应、路由失败及卸载不会覆盖当前页统计或继续重试', async () => {
  const { tracker, send, publish, fail } = fixture()
  let resolveFirst: (value: typeof result) => void = () => {}
  send.mockImplementationOnce(() => new Promise((resolve) => {
    resolveFirst = resolve
  }))
  const first = tracker.open('/posts')
  await tracker.open('/about')
  resolveFirst(result)
  await first
  expect(publish).toHaveBeenCalledOnce()
  tracker.leave()
  await tracker.open('/about')
  expect(send).toHaveBeenCalledTimes(3)
  tracker.stop()
  await tracker.open('/tools')
  expect(send).toHaveBeenCalledTimes(3)
  expect(fail).not.toHaveBeenCalled()
})

test('网络持续失败保持错误状态，不无限重试', async () => {
  const { tracker, send, fail } = fixture()
  send.mockRejectedValue(new Error('offline'))
  await tracker.open('/posts')
  expect(send).toHaveBeenCalledTimes(2)
  expect(fail).toHaveBeenCalledWith('/posts')
})

test('访客 Cookie 复用随机标识，设置一年期限和子路径，存储被禁用时不抛错', () => {
  const makeId = vi.fn(randomUUID)
  const document = { cookie: '' }
  ensureVisitorCookie(document, '/blog/', true, makeId)
  expect(document.cookie).toContain('Max-Age=31536000; Path=/blog/; SameSite=Lax; Secure')
  ensureVisitorCookie(document, '/blog/', true, makeId)
  expect(makeId).toHaveBeenCalledOnce()
  const blocked = {
    get cookie(): string {
      throw new Error('blocked')
    },
    set cookie(_value: string) {},
  }
  expect(() => ensureVisitorCookie(blocked, '/', false, makeId)).not.toThrow()
})
