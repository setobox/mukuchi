import type { AssistantMessage, AssistantPage, AssistantSession, SignedTurn } from '#shared/assistant/model'
import type { StreamPayload } from '#shared/assistant/stream'
import type { DeletedConversation, LocalHistory } from './history'
import type { Conversation, LocalTurn } from './local-model'
import { computed, reactive, ref, shallowRef } from 'vue'
import { z } from 'zod'
import { articlePathSchema, assistantLimits, assistantSessionSchema, turnResponseSchema } from '#shared/assistant/model'
import { groupConversations } from './local-model'

export interface AssistantTransport {
  session: () => Promise<unknown>
  post: (path: string, body: unknown, csrf: string, signal?: AbortSignal) => Promise<unknown>
  stream?: (path: string, body: unknown, csrf: string, requestId: string, receive: (payload: StreamPayload) => void, signal?: AbortSignal) => Promise<unknown>
}
interface ActiveTurn { id: string, conversationId: string, namespace: string, csrf: string, controller: AbortController, page: string | null, stored: boolean, stopping?: boolean, startedAt: number }
interface LiveReply { label: string, message: AssistantMessage }
export function createAssistantController(options: { history: Promise<LocalHistory>, transport: AssistantTransport, navigate: (path: string) => Promise<void>, automaticNavigation?: boolean, now?: () => number, ownerId?: string }) {
  const now = options.now ?? Date.now
  const session = shallowRef<AssistantSession | null>(null)
  const mode = ref<'hidden' | 'fullscreen' | 'floating'>('hidden')
  const drawer = ref(false)
  const currentId = ref<string>(crypto.randomUUID())
  const conversations = shallowRef<Conversation[]>([])
  const turns = shallowRef<LocalTurn[]>([])
  const drafts = reactive<Record<string, string>>({})
  const page = ref<AssistantPage>({ path: null })
  const pageTitle = ref('')
  const active = shallowRef<ActiveTurn | null>(null)
  const previews = shallowRef<Record<string, LiveReply>>({})
  const live = new Map<string, LiveReply>()
  let frame: { cancel: () => void } | undefined
  function flushPreviews() {
    frame?.cancel()
    frame = undefined
    previews.value = Object.fromEntries([...live].map(([id, value]) => [id, { label: value.label, message: { ...value.message, blocks: [...value.message.blocks], references: [...value.message.references] } }]))
  }
  function queuePreview() {
    if (frame)
      return
    if (typeof requestAnimationFrame === 'function') {
      const id = requestAnimationFrame(flushPreviews)
      frame = { cancel: () => cancelAnimationFrame(id) }
    }
    else {
      const id = setTimeout(flushPreviews, 16)
      frame = { cancel: () => clearTimeout(id) }
    }
  }
  function partial(running: ActiveTurn) {
    const message = live.get(running.id)?.message
    return { ...(message?.blocks.length ? { preview: { ...message, blocks: message.blocks.filter(Boolean) } } : {}), durationMs: Math.max(0, now() - running.startedAt) }
  }
  const busyElsewhere = ref(false)
  const error = ref('')
  const storageWarning = ref('')
  const limited = ref(false)
  const clock = ref(now())
  const undoSnapshot = shallowRef<DeletedConversation | null>(null)
  const liveActions = new Set<string>()
  const actionBusy = ref(false)
  const queuedSend = ref(false)
  const navigationResults = reactive<Record<string, 'succeeded' | 'failed' | 'cancelled'>>({})
  let revision = 0
  let disposed = false
  let sessionRevision = 0
  const recoveredNamespaces = new Set<string>()
  const draft = computed({ get: () => drafts[currentId.value] ?? '', set: value => drafts[currentId.value] = value })
  const groups = computed(() => groupConversations(conversations.value, new Date(clock.value)))
  const unread = computed(() => conversations.value.some(item => item.unread))
  const enabled = computed(() => session.value?.enabled ?? false)
  const busy = computed(() => !!active.value || busyElsewhere.value)
  function showError(cause: unknown) {
    error.value = cause instanceof Error ? cause.message : '操作失败，请重试'
  }
  async function reload() {
    const identity = session.value
    if (!identity?.namespace || disposed)
      return
    const id = currentId.value
    const version = ++revision
    const history = await options.history
    const [list, messages, pending] = await Promise.all([history.list(identity.namespace), history.messages(identity.namespace, id), history.pending(identity.namespace)])
    if (version !== revision || identity.namespace !== session.value?.namespace || id !== currentId.value || disposed)
      return
    conversations.value = list
    turns.value = messages
    busyElsewhere.value = pending.some(turn => turn.id !== active.value?.id && turn.createdAt + assistantLimits.turnMs + 5000 > now())
    clock.value = now()
    const running = active.value
    if (running?.stored && running.namespace === identity.namespace && !list.some(item => item.id === running.conversationId))
      void stop()
  }
  async function stop() {
    const running = active.value
    if (!running || running.stopping)
      return
    running.stopping = true
    running.stored = false
    running.controller.abort()
    const history = await options.history
    await history.finish(running.namespace, running.conversationId, running.id, { status: 'cancelled', ...partial(running) }, false)
    live.delete(running.id)
    flushPreviews()
    try {
      await options.transport.post(`/turns/${running.id}/cancel`, {}, running.csrf)
    }
    catch { /* The server's bounded lease still prevents another concurrent call. */ }
    if (active.value === running)
      active.value = null
    await reload()
  }
  async function refreshSession() {
    const version = ++sessionRevision
    try {
      const value = assistantSessionSchema.parse(await options.transport.session())
      if (version !== sessionRevision || disposed)
        return
      const identityChanged = session.value?.namespace !== value.namespace
      if (identityChanged) {
        queuedSend.value = false
        await stop()
        revision++
        turns.value = []
        live.clear()
        flushPreviews()
        conversations.value = []
        drawer.value = false
        undoSnapshot.value = null
        liveActions.clear()
        for (const id of Object.keys(drafts)) delete drafts[id]
        currentId.value = crypto.randomUUID()
      }
      session.value = value
      if (!value.enabled)
        mode.value = 'hidden'
      if (value.namespace) {
        const history = await options.history
        if (options.ownerId && !recoveredNamespaces.has(value.namespace)) {
          await history.interruptOwner(value.namespace, options.ownerId)
          recoveredNamespaces.add(value.namespace)
        }
        await history.interruptExpired(value.namespace, now() - assistantLimits.turnMs - 5000)
        const recent = await history.recent(value.namespace)
        if (identityChanged && recent && !(await history.list(value.namespace)).every(item => item.id !== recent))
          currentId.value = recent
        await reload()
      }
    }
    catch { error.value = '助手暂不可用，请稍后重试' }
  }
  async function select(id: string) {
    const identity = session.value
    if (!identity)
      return
    try {
      const history = await options.history
      await history.select(identity.namespace, id)
      currentId.value = id
      turns.value = []
      drawer.value = false
      error.value = ''
      await reload()
    }
    catch (cause) { showError(cause) }
  }
  async function newConversation() {
    queuedSend.value = false
    currentId.value = crypto.randomUUID()
    turns.value = []
    limited.value = false
    drawer.value = false
    error.value = ''
    if (session.value)
      await (await options.history).select(session.value.namespace, null)
  }
  async function open(text?: string, submit = false) {
    if (!enabled.value)
      await refreshSession()
    if (!enabled.value)
      return
    mode.value = 'fullscreen'
    if (text !== undefined)
      draft.value = text
    queuedSend.value = submit
    if (session.value && conversations.value.some(item => item.id === currentId.value))
      await (await options.history).select(session.value.namespace, currentId.value)
    await reload()
  }
  function close() {
    queuedSend.value = false
    mode.value = 'hidden'
    drawer.value = false
  }
  function routeChanged(path: string, title = '') {
    if (mode.value !== 'hidden')
      mode.value = 'floating'
    const parsed = articlePathSchema.safeParse(path)
    page.value = { path: parsed.success ? parsed.data : null }
    pageTitle.value = title
  }
  async function navigateAction(actionId: string, conversationId: string, clicked: boolean) {
    const identity = session.value
    if (!identity || actionBusy.value || navigationResults[actionId] || (!clicked && !liveActions.has(actionId)))
      return
    actionBusy.value = true
    const originalPage = page.value.path
    try {
      const value = z.object({ path: articlePathSchema, actionId: z.uuid() }).strict().parse(await options.transport.post(`/actions/${actionId}/claim`, { conversationId, clicked }, identity.csrf))
      // The panel or identity may have changed while waiting for permission to navigate.
      if (mode.value === 'hidden' || currentId.value !== conversationId || identity.namespace !== session.value?.namespace || page.value.path !== originalPage) {
        navigationResults[actionId] = 'cancelled'
      }
      else {
        await options.navigate(value.path)
        navigationResults[actionId] = 'succeeded'
      }
      await options.transport.post(`/actions/${actionId}/result`, { conversationId, status: navigationResults[actionId] }, identity.csrf)
    }
    catch {
      navigationResults[actionId] ??= 'failed'
      error.value = '文章打开失败或操作已失效，请重新选择文章'
    }
    finally {
      actionBusy.value = false
      liveActions.delete(actionId)
    }
  }
  async function send(turnstileToken?: string) {
    const identity = session.value
    const text = draft.value.trim()
    if (!identity?.enabled || !text || busy.value)
      return
    if (text.length > assistantLimits.inputLength) {
      error.value = '问题最多 500 个字符'
      return
    }
    if (!identity.authenticated && !turnstileToken) {
      error.value = '请先完成人机验证'
      return
    }
    queuedSend.value = false
    const running: ActiveTurn = { id: crypto.randomUUID(), conversationId: currentId.value, namespace: identity.namespace, csrf: identity.csrf, controller: new AbortController(), page: page.value.path, stored: false, startedAt: now() }
    active.value = running
    live.set(running.id, { label: '正在连接…', message: { id: running.id, role: 'assistant', blocks: [], references: [] } })
    flushPreviews()
    error.value = ''
    limited.value = false
    const history = await options.history
    const timer = setTimeout(() => running.controller.abort(), assistantLimits.turnMs + 5000)
    try {
      const previous = await history.messages(running.namespace, running.conversationId)
      const records = previous.flatMap(turn => turn.status === 'completed' && turn.record ? [turn.record] : [])
      const recent = records.slice(-8)
      // The HTTP bound also applies before sending; never upload an entire long conversation.
      while (new TextEncoder().encode(JSON.stringify(recent)).byteLength > assistantLimits.historyUploadBytes) recent.shift()
      const candidate = recent.at(-1)?.assistant.blocks.find(block => block.type === 'navigation_confirmation' && block.expiresAt > now() && !navigationResults[block.actionId])
      const pendingActionId = candidate?.type === 'navigation_confirmation' && liveActions.has(candidate.actionId) ? candidate.actionId : undefined
      const row = (await history.list(running.namespace)).find(item => item.id === running.conversationId)
      await history.append({ id: running.id, conversationId: running.conversationId, namespace: running.namespace, createdAt: now(), user: text, page: { path: running.page }, status: 'pending', ownerId: options.ownerId }, row?.version ?? null)
      running.stored = true
      drafts[running.conversationId] = ''
      await reload()
      const receive = (payload: StreamPayload) => {
        if (disposed || running.controller.signal.aborted || active.value !== running || session.value?.namespace !== running.namespace)
          return
        const preview = live.get(running.id)!
        if (payload.type === 'status') {
          preview.label = payload.label
        }
        else if (payload.type === 'text_delta') {
          const existing = preview.message.blocks[payload.index]
          if (existing && existing.type !== 'text')
            throw new Error('回复结构发生变化')
          const text = (existing?.text ?? '') + payload.text
          if (text.length > assistantLimits.visibleLength)
            throw new Error('回复超过长度限制')
          preview.message.blocks[payload.index] = { type: 'text', text }
        }
        else if (payload.type === 'block') {
          preview.message.blocks[payload.index] = payload.block
          preview.message.references = payload.references
        }
        queuePreview()
      }
      const postTurn = async (path: string, body: unknown) => {
        const response = options.transport.stream
          ? await options.transport.stream(path, body, running.csrf, running.id, receive, running.controller.signal)
          : await options.transport.post(path, body, running.csrf, running.controller.signal)
        flushPreviews()
        return turnResponseSchema.parse(response)
      }
      let response = await postTurn('/turns', { requestId: running.id, conversationId: running.conversationId, text, page: { path: running.page }, history: recent, turnstileToken, pendingActionId })
      let continuations = 0
      while (response.kind === 'needs_history') {
        if (++continuations > assistantLimits.historyCalls || response.requestId !== running.id || response.conversationId !== running.conversationId)
          throw new Error('历史续传请求无效')
        running.controller.signal.throwIfAborted()
        const local = (await history.messages(running.namespace, running.conversationId)).flatMap(turn => turn.status === 'completed' && turn.record ? [turn.record] : [])
        const before = response.historyRequest.before
        const cursor = before ? local.findIndex(turn => turn.id === before) : local.length
        const older: SignedTurn[] = cursor < 0 ? [] : local.slice(Math.max(0, cursor - response.historyRequest.limit), cursor)
        while (new TextEncoder().encode(JSON.stringify(older)).byteLength > assistantLimits.historyUploadBytes) older.shift()
        response = await postTurn('/turns/continue', { continuation: response.continuation, history: older })
      }
      running.controller.signal.throwIfAborted()
      if (response.kind === 'rejected')
        throw new Error(response.message)
      const visible = mode.value !== 'hidden' && currentId.value === running.conversationId && session.value?.namespace === running.namespace
      const stored = await history.finish(running.namespace, running.conversationId, running.id, { status: 'completed', record: response.record }, !visible, now())
      if (stored && session.value?.namespace === running.namespace) {
        limited.value = response.contextLimited
        for (const block of response.record.assistant.blocks) {
          if (block.type === 'navigation_confirmation')
            liveActions.add(block.actionId)
        }
        await reload()
        if (response.navigate && visible && page.value.path === running.page && options.automaticNavigation !== false)
          await navigateAction(response.navigate, running.conversationId, false)
      }
    }
    catch (cause) {
      const aborted = running.controller.signal.aborted
      await history.finish(running.namespace, running.conversationId, running.id, { status: running.stopping ? 'cancelled' : aborted ? 'interrupted' : 'failed', ...partial(running), error: running.stopping ? undefined : aborted ? '本次回答已中断，请重新提问' : '本次回答未完成，请调整问题或稍后重试' }, false, now())
      if (!running.stopping && currentId.value === running.conversationId && session.value?.namespace === running.namespace) {
        if (aborted)
          error.value = '本次回答已中断，请重新提问'
        else showError(cause)
      }
    }
    finally {
      clearTimeout(timer)
      live.delete(running.id)
      flushPreviews()
      if (active.value === running)
        active.value = null
      await reload()
      if (disposed)
        history.close()
    }
  }
  async function remove(id: string) {
    if (!session.value)
      return
    if (active.value?.conversationId === id)
      await stop()
    undoSnapshot.value = await (await options.history).remove(session.value.namespace, id)
    delete drafts[id]
    if (currentId.value === id)
      await newConversation()
    await reload()
  }
  async function undo() {
    if (!undoSnapshot.value || undoSnapshot.value.conversation.namespace !== session.value?.namespace)
      return
    const history = await options.history
    if (await history.undo(undoSnapshot.value))
      await select(undoSnapshot.value.conversation.id)
    undoSnapshot.value = null
    await reload()
  }
  async function clear() {
    if (!session.value)
      return
    await stop()
    await (await options.history).clear(session.value.namespace)
    undoSnapshot.value = null
    for (const id of Object.keys(drafts)) delete drafts[id]
    await newConversation()
    await reload()
  }
  async function tick() {
    clock.value = now()
    if (session.value?.namespace) {
      await (await options.history).interruptExpired(session.value.namespace, now() - assistantLimits.turnMs - 5000)
      await reload()
    }
  }
  function dispose() {
    disposed = true
    frame?.cancel()
    frame = undefined
    active.value?.controller.abort()
    // An in-flight send persists its partial response before closing the database.
    if (!active.value) {
      live.clear()
      void options.history.then(history => history.close())
    }
  }
  return { session, mode, drawer, currentId, conversations, turns, draft, page, pageTitle, active, previews, error, storageWarning, limited, groups, unread, busy, busyElsewhere, enabled, undoSnapshot, navigationResults, actionBusy, queuedSend, refreshSession, reload, select, newConversation, open, close, routeChanged, send, stop, remove, undo, clear, tick, dispose, navigateAction }
}
export type AssistantController = ReturnType<typeof createAssistantController>
