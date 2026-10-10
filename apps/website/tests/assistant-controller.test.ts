import type { AssistantTransport } from '../app/features/assistant/controller'
import type { TurnRequest } from '../shared/assistant/model'
import type { StreamPayload } from '../shared/assistant/stream'
import { expect, test, vi } from 'vite-plus/test'
import { createAssistantController } from '../app/features/assistant/controller'
import { createLocalHistory } from '../app/features/assistant/history'
import { memoryHistoryDatabase } from '../app/features/assistant/storage'

function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
function answer(request: TurnRequest, navigation = false) {
  const actionId = crypto.randomUUID()
  return { kind: 'completed', record: { id: request.requestId, conversationId: request.conversationId, createdAt: Date.now(), user: request.text, proof: 'mock-proof', assistant: { id: crypto.randomUUID(), role: 'assistant', blocks: navigation ? [{ type: 'navigation_confirmation', actionId, target: { articleId: '/posts/a', path: '/posts/a', title: '文章 A' }, expiresAt: Date.now() + 300_000 }] : [{ type: 'text', text: '已检查的回答' }], references: [] } }, contextLimited: false, ...(navigation ? { navigate: actionId } : {}) }
}
async function setup() {
  const history = createLocalHistory(memoryHistoryDatabase())
  const identity = { enabled: true, namespace: 'account:a', csrf: 'csrf-a', authenticated: true, turnstileSiteKey: '', remaining: 50, inputLimit: 500 }
  const response = deferred<unknown>()
  const started = deferred<TurnRequest>()
  const transport: AssistantTransport = {
    session: vi.fn(async () => identity),
    post: vi.fn(async (path, body) => {
      if (path === '/turns') {
        started.resolve(body as TurnRequest)
        return response.promise
      }
      return { cancelled: true }
    }),
  }
  const navigate = vi.fn(async () => {})
  const controller = createAssistantController({ history: Promise.resolve(history), transport, navigate })
  await controller.refreshSession()
  await controller.open()
  controller.draft.value = '介绍文章'
  return { controller, history, transport, navigate, response, started, identity }
}

test('流式部分回复在停止后保留，迟到事件被丢弃且不作为可信历史上传', async () => {
  const { controller, transport, response, started } = await setup()
  let receive: (payload: StreamPayload) => void = () => {}
  transport.stream = vi.fn(async (_path, body, _csrf, _id, emit) => {
    receive = emit
    emit({ type: 'status', label: 'Thinking…' })
    emit({ type: 'text_delta', index: 0, text: '已经显示的中文' })
    started.resolve(body as TurnRequest)
    return response.promise
  })
  const sending = controller.send()
  const request = await started.promise
  await vi.waitFor(() => expect(controller.previews.value[request.requestId]?.message.blocks[0]).toEqual({ type: 'text', text: '已经显示的中文' }))
  await controller.stop()
  receive({ type: 'text_delta', index: 0, text: '不应出现' })
  response.resolve(answer(request))
  await sending
  expect(controller.turns.value[0]).toMatchObject({ status: 'cancelled', preview: { blocks: [{ type: 'text', text: '已经显示的中文' }] } })
  expect(controller.turns.value[0]?.record).toBeUndefined()
  expect(controller.previews.value).toEqual({})
  transport.stream = vi.fn(async (_path, body) => {
    expect((body as TurnRequest).history).toEqual([])
    return answer(body as TurnRequest)
  })
  controller.draft.value = '继续'
  await controller.send()
  expect(controller.turns.value.at(-1)?.status).toBe('completed')
  controller.dispose()
})

test('流式历史续传沿用请求标识及单条当前状态，最终签名后才完成', async () => {
  const { controller, transport } = await setup()
  let request: TurnRequest
  const stream = vi.fn<NonNullable<AssistantTransport['stream']>>(async (path, body, _csrf, id, receive) => {
    if (path === '/turns') {
      request = body as TurnRequest
      receive({ type: 'status', label: '正在读取会话历史…' })
      return { kind: 'needs_history', requestId: id, conversationId: request.conversationId, continuation: 'fixture', historyRequest: { before: null, limit: 2 } }
    }
    expect(id).toBe(request.requestId)
    expect(body).toEqual({ continuation: 'fixture', history: [] })
    receive({ type: 'text_delta', index: 0, text: '完成' })
    return answer(request)
  })
  transport.stream = stream
  await controller.send()
  expect(stream).toHaveBeenCalledTimes(2)
  expect(controller.turns.value[0]?.status).toBe('completed')
  expect(controller.previews.value).toEqual({})
  controller.dispose()
})
test('关闭面板继续生成，回复写入原会话并显示未读；重新打开保留内容', async () => {
  const { controller, response, started } = await setup()
  const sending = controller.send()
  const request = await started.promise
  controller.close()
  expect(controller.active.value?.controller.signal.aborted).toBe(false)
  response.resolve(answer(request))
  await sending
  expect(controller.mode.value).toBe('hidden')
  expect(controller.unread.value).toBe(true)
  await controller.open()
  expect(controller.turns.value[0]?.record?.user).toBe('介绍文章')
  expect(controller.unread.value).toBe(false)
  controller.dispose()
})
test('新建会话不中止旧请求，迟到回复不写到新会话，不执行自动导航', async () => {
  const { controller, history, response, started, navigate } = await setup()
  const sending = controller.send()
  const request = await started.promise
  await controller.newConversation()
  const nextId = controller.currentId.value
  expect(controller.busy.value).toBe(true)
  controller.draft.value = '另一个问题'
  await controller.send()
  response.resolve(answer(request, true))
  await sending
  expect(controller.currentId.value).toBe(nextId)
  expect(controller.turns.value).toEqual([])
  expect(controller.draft.value).toBe('另一个问题')
  expect(await history.messages('account:a', request.conversationId)).toHaveLength(1)
  expect(navigate).not.toHaveBeenCalled()
  controller.dispose()
})
test('页面切换自动缩小并保留请求快照；隐藏面板不被导航唤起', async () => {
  const { controller, response, started, navigate } = await setup()
  controller.routeChanged('/posts/first')
  controller.mode.value = 'fullscreen'
  const sending = controller.send()
  const request = await started.promise
  controller.routeChanged('/posts/second')
  expect(request.page.path).toBe('/posts/first')
  expect(controller.page.value.path).toBe('/posts/second')
  expect(controller.mode.value).toBe('floating')
  response.resolve(answer(request, true))
  await sending
  expect(navigate).not.toHaveBeenCalled()
  controller.close()
  controller.routeChanged('/about')
  expect(controller.mode.value).toBe('hidden')
  controller.dispose()
})
test('删除活动会话发送取消，即使服务稍后返回也不会复活；撤销不恢复任务', async () => {
  const { controller, history, response, started, transport } = await setup()
  const sending = controller.send()
  const request = await started.promise
  await controller.remove(request.conversationId)
  expect(transport.post).toHaveBeenCalledWith(`/turns/${request.requestId}/cancel`, {}, 'csrf-a')
  response.resolve(answer(request))
  await sending
  expect(await history.list('account:a')).toEqual([])
  await controller.undo()
  expect(controller.turns.value[0]?.status).toBe('cancelled')
  expect(controller.active.value).toBeNull()
  controller.dispose()
})
test('身份切换不合并本地历史，旧身份结果不出现在新身份中', async () => {
  const { controller, identity, response, started } = await setup()
  const sending = controller.send()
  const request = await started.promise
  identity.namespace = 'account:b'
  identity.csrf = 'csrf-b'
  await controller.refreshSession()
  response.resolve(answer(request))
  await sending
  expect(controller.session.value?.namespace).toBe('account:b')
  expect(controller.turns.value).toEqual([])
  expect(controller.conversations.value).toEqual([])
  controller.dispose()
})
test('刷新可恢复本地记录，历史导航不会自动重放', async () => {
  const { controller, history, transport, response, started, navigate } = await setup()
  const sending = controller.send()
  const request = await started.promise
  controller.close()
  response.resolve(answer(request, true))
  await sending
  const restored = createAssistantController({ history: Promise.resolve(history), transport, navigate })
  await restored.refreshSession()
  expect(restored.mode.value).toBe('hidden')
  await restored.open()
  expect(restored.turns.value[0]?.record?.id).toBe(request.requestId)
  expect(navigate).not.toHaveBeenCalled()
  controller.dispose()
  restored.dispose()
})

test('停止时立即中止的网络请求仍保存为手动取消，不出现中断错误', async () => {
  const { controller, transport, started } = await setup()
  const cancellation = deferred<unknown>()
  transport.post = vi.fn(async (path, body, _csrf, signal) => {
    if (path === '/turns') {
      started.resolve(body as TurnRequest)
      return new Promise((_resolve, reject) => signal?.addEventListener('abort', () => reject(new Error('aborted'))))
    }
    return cancellation.promise
  })
  const sending = controller.send()
  await started.promise
  const stopping = controller.stop()
  await sending
  expect(controller.turns.value[0]?.status).toBe('cancelled')
  expect(controller.error.value).toBe('')
  cancellation.resolve({ cancelled: true })
  await stopping
  controller.dispose()
})
