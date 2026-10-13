import type { PreviewChannel } from '../app/features/admin/preview-sync'
import type { ArticlePreview, PreviewSnapshot } from '../shared/admin/preview'
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test'
import { createPreviewPublisher, createPreviewReceiver, previewChannelName } from '../app/features/admin/preview-sync'

class Channel implements PreviewChannel {
  listeners = new Set<(event: MessageEvent<unknown>) => void>()
  sent: unknown[] = []
  closed = false
  constructor(readonly name: string, readonly channels: Channel[]) {
    channels.push(this)
  }

  postMessage(message: unknown) {
    this.sent.push(message)
    for (const channel of this.channels) {
      if (channel !== this && channel.name === this.name && !channel.closed)
        queueMicrotask(() => channel.deliver(message))
    }
  }

  deliver(data: unknown) {
    if (!this.closed) {
      for (const listener of this.listeners)
        listener({ data } as MessageEvent<unknown>)
    }
  }

  addEventListener(_type: 'message', listener: (event: MessageEvent<unknown>) => void) { this.listeners.add(listener) }
  removeEventListener(_type: 'message', listener: (event: MessageEvent<unknown>) => void) { this.listeners.delete(listener) }
  close() { this.closed = true }
}
const result = (title: string) => ({ data: { title }, body: { type: 'root', children: [] }, toc: { links: [] } }) as ArticlePreview
const snapshot = (version: number, source = `正文 ${version}`): PreviewSnapshot => ({ version, source })
function fixture() {
  const channels: Channel[] = []
  const stored = new Map<string, string>()
  const storage = {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => { stored.set(key, value) },
    removeItem: (key: string) => { stored.delete(key) },
  }
  const channel = (name = 'preview') => new Channel(name, channels)
  const load = vi.fn(async (value: PreviewSnapshot) => result(value.source))
  const unauthorized = vi.fn()
  const receiver = (endpoint = channel()) => createPreviewReceiver({ channel: endpoint, storage, key: endpoint.name, load, onUnauthorized: unauthorized, errorMessage: cause => cause instanceof Error ? cause.message : '失败' })
  return { channel, storage, stored, load, unauthorized, receiver }
}
async function settle() {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}
beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
afterEach(() => vi.useRealTimers())

test('握手立即取得未保存源码和摘要，连续编辑 500 ms 后只发送最新版本', async () => {
  const f = fixture()
  let source = '未保存正文'
  const publisher = createPreviewPublisher(f.channel(), () => ({ source, summaryText: '未保存摘要' }))
  const preview = f.receiver()
  await settle()
  expect(f.load).toHaveBeenCalledExactlyOnceWith({ version: 1, source, summaryText: '未保存摘要' })
  expect(preview.connection.value).toBe('live')
  source = '中间内容'
  publisher.update()
  await vi.advanceTimersByTimeAsync(400)
  source = '最新内容'
  publisher.update()
  await vi.advanceTimersByTimeAsync(499)
  expect(f.load).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(1)
  expect(f.load).toHaveBeenLastCalledWith({ version: 3, source, summaryText: '未保存摘要' })
  expect(preview.preview.value?.data.title).toBe('最新内容')
  publisher.close()
  await settle()
  expect(preview.connection.value).toBe('snapshot')
  expect(preview.preview.value?.data.title).toBe('最新内容')
  preview.stop()
})

test('同一草稿的不同编辑器与不同账号使用独立通道，不互相覆盖', async () => {
  const f = fixture()
  const names = [previewChannelName('a', 'draft', 'one'), previewChannelName('a', 'draft', 'two'), previewChannelName('b', 'draft', 'one')]
  const publishers = names.map(name => createPreviewPublisher(f.channel(name), () => ({ source: name })))
  const receivers = names.map(name => f.receiver(f.channel(name)))
  await settle()
  expect(receivers.map(value => value.preview.value?.data.title)).toEqual(names)
  publishers.forEach(value => value.close())
  receivers.forEach(value => value.stop())
})

test('慢解析期间合并新版本，旧结果及乱序消息不能覆盖最新内容', async () => {
  const f = fixture()
  const endpoint = f.channel()
  const pending: ((value: ArticlePreview) => void)[] = []
  f.load.mockImplementation(() => new Promise(resolve => pending.push(resolve)))
  const receiver = f.receiver(endpoint)
  endpoint.deliver({ type: 'snapshot', snapshot: snapshot(1) })
  endpoint.deliver({ type: 'snapshot', snapshot: snapshot(3) })
  endpoint.deliver({ type: 'snapshot', snapshot: snapshot(2) })
  expect(f.load).toHaveBeenCalledTimes(1)
  pending[0]!(result('过期'))
  await settle()
  expect(receiver.preview.value).toBeNull()
  expect(f.load).toHaveBeenLastCalledWith(snapshot(3))
  pending[1]!(result('最新'))
  await settle()
  expect(receiver.preview.value?.data.title).toBe('最新')
  expect(JSON.parse(f.stored.get('preview')!)).toEqual(snapshot(3))
  receiver.stop()
})

test('解析错误保留成功画面和快照，修复或手动重试可以恢复', async () => {
  const f = fixture()
  const endpoint = f.channel()
  const receiver = f.receiver(endpoint)
  endpoint.deliver({ type: 'snapshot', snapshot: snapshot(1) })
  await settle()
  f.load.mockRejectedValueOnce(new Error('YAML 无效'))
  endpoint.deliver({ type: 'snapshot', snapshot: snapshot(2) })
  await settle()
  expect(receiver.error.value).toBe('YAML 无效')
  expect(receiver.preview.value?.data.title).toBe('正文 1')
  expect(JSON.parse(f.stored.get('preview')!).version).toBe(1)
  receiver.retry()
  await settle()
  expect(receiver.error.value).toBe('')
  expect(receiver.preview.value?.data.title).toBe('正文 2')
  receiver.stop()
})

test('刷新优先等待实时握手，编辑器失联才恢复成功快照；坏缓存可重试', async () => {
  const f = fixture()
  f.stored.set('preview', JSON.stringify(snapshot(4)))
  const receiver = f.receiver()
  expect(f.load).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(2000)
  expect(receiver.preview.value?.data.title).toBe('正文 4')
  expect(receiver.connection.value).toBe('snapshot')
  receiver.stop()
  const publisher = createPreviewPublisher(f.channel(), () => ({ source: '实时内容' }))
  const refreshed = f.receiver()
  await settle()
  expect(refreshed.preview.value?.data.title).toBe('实时内容')
  await vi.advanceTimersByTimeAsync(2000)
  expect(refreshed.preview.value?.data.title).toBe('实时内容')
  publisher.close()
  refreshed.stop()
  f.stored.set('preview', '{broken')
  const broken = f.receiver()
  await vi.advanceTimersByTimeAsync(2000)
  expect(broken.error.value).toContain('无法读取')
  broken.stop()
})

test.each([401, 403])('鉴权失败 %s 清空画面和快照并停止同步；停止后忽略异步结果', async (statusCode) => {
  const f = fixture()
  const endpoint = f.channel()
  const receiver = f.receiver(endpoint)
  endpoint.deliver({ type: 'snapshot', snapshot: snapshot(1) })
  await settle()
  f.load.mockRejectedValueOnce({ statusCode })
  endpoint.deliver({ type: 'snapshot', snapshot: snapshot(2) })
  await settle()
  expect(receiver.preview.value).toBeNull()
  expect(f.stored.size).toBe(0)
  expect(f.unauthorized).toHaveBeenCalledOnce()
  expect(endpoint.closed).toBe(true)
  receiver.stop()
})

test('无效跨页消息不会触发加载，关闭预览后晚到的解析结果不会写缓存', async () => {
  const f = fixture()
  const endpoint = f.channel()
  const receiver = f.receiver(endpoint)
  endpoint.deliver({ type: 'snapshot', snapshot: { version: -1, source: '坏消息' } })
  endpoint.deliver({ type: 'snapshot', snapshot: { version: 1, source: 42 } })
  expect(f.load).not.toHaveBeenCalled()
  let resolve!: (value: ArticlePreview) => void
  f.load.mockImplementationOnce(() => new Promise((done) => {
    resolve = done
  }))
  endpoint.deliver({ type: 'snapshot', snapshot: snapshot(1) })
  receiver.stop()
  resolve(result('晚到'))
  await settle()
  expect(receiver.preview.value).toBeNull()
  expect(f.stored.size).toBe(0)
})
