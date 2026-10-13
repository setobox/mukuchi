import type { ArticlePreview, PreviewSnapshot } from '#shared/admin/preview'
import { ref, shallowRef } from 'vue'
import { previewMessageSchema, previewSnapshotSchema } from '#shared/admin/preview'

export interface PreviewChannel {
  postMessage: (message: unknown) => void
  addEventListener: (type: 'message', listener: (event: MessageEvent<unknown>) => void) => void
  removeEventListener: (type: 'message', listener: (event: MessageEvent<unknown>) => void) => void
  close: () => void
}
export const previewChannelName = (owner: string, draft: string, session: string) => `article-preview:${owner}:${draft}:${session}`

/** One publisher per editor mount, shared by any previews opened from that editor. */
export function createPreviewPublisher(channel: PreviewChannel, read: () => Omit<PreviewSnapshot, 'version'>) {
  let version = 1
  let timer: ReturnType<typeof setTimeout> | undefined
  let closed = false
  function send() {
    if (!closed)
      channel.postMessage({ type: 'snapshot', snapshot: { ...read(), version } })
  }
  function receive(event: MessageEvent<unknown>) {
    const message = previewMessageSchema.safeParse(event.data)
    if (message.success && message.data.type === 'hello')
      send()
  }
  channel.addEventListener('message', receive)
  return {
    update() {
      if (closed)
        return
      version++
      clearTimeout(timer)
      timer = setTimeout(send, 500)
    },
    close() {
      if (closed)
        return
      closed = true
      clearTimeout(timer)
      channel.postMessage({ type: 'closed' })
      channel.removeEventListener('message', receive)
      channel.close()
    },
  }
}

export interface PreviewReceiverOptions {
  channel: PreviewChannel
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
  key: string
  load: (snapshot: PreviewSnapshot) => Promise<ArticlePreview>
  errorMessage: (error: unknown) => string
  onUnauthorized: () => void
}

/** Serial rendering coalesces edits and never publishes an obsolete result. */
export function createPreviewReceiver(options: PreviewReceiverOptions) {
  const preview = shallowRef<ArticlePreview | null>(null)
  const revision = ref(0)
  const connection = ref<'connecting' | 'live' | 'snapshot'>('connecting')
  const loading = ref(false)
  const error = ref('')
  let latest = 0
  let pending: PreviewSnapshot | undefined
  let last: PreviewSnapshot | undefined
  let stopped = false
  let running = false
  let handshake: ReturnType<typeof setTimeout> | undefined

  function forget() {
    try {
      options.storage.removeItem(options.key)
    }
    catch { /* Browser storage can be unavailable. */ }
  }
  async function drain() {
    if (running || stopped)
      return
    running = true
    loading.value = true
    while (pending && !stopped) {
      const snapshot = pending
      pending = undefined
      try {
        const result = await options.load(snapshot)
        if (stopped || snapshot.version !== latest)
          continue
        preview.value = result
        revision.value = snapshot.version
        error.value = ''
        try {
          options.storage.setItem(options.key, JSON.stringify(snapshot))
        }
        catch { /* Rendering still works when storage is full or disabled. */ }
      }
      catch (cause) {
        const status = cause && typeof cause === 'object' && 'statusCode' in cause ? cause.statusCode : undefined
        if (!stopped && (status === 401 || status === 403)) {
          stop()
          preview.value = null
          forget()
          options.onUnauthorized()
        }
        else if (!stopped && snapshot.version === latest) {
          error.value = options.errorMessage(cause)
        }
      }
    }
    running = false
    loading.value = false
  }
  function enqueue(snapshot: PreviewSnapshot, force = false) {
    if (stopped || (!force && snapshot.version <= latest))
      return
    latest = snapshot.version
    last = snapshot
    pending = snapshot
    void drain()
  }
  function receive(event: MessageEvent<unknown>) {
    const parsed = previewMessageSchema.safeParse(event.data)
    if (!parsed.success || stopped)
      return
    const message = parsed.data
    if (message.type === 'closed') {
      connection.value = 'snapshot'
      return
    }
    if (message.type === 'snapshot') {
      clearTimeout(handshake)
      connection.value = 'live'
      enqueue(message.snapshot)
    }
  }
  function connect() {
    if (stopped)
      return
    clearTimeout(handshake)
    connection.value = 'connecting'
    options.channel.postMessage({ type: 'hello' })
    handshake = setTimeout(() => {
      connection.value = 'snapshot'
      if (!last) {
        try {
          const stored = options.storage.getItem(options.key)
          const snapshot = previewSnapshotSchema.safeParse(stored ? JSON.parse(stored) : null)
          if (snapshot.success)
            enqueue(snapshot.data)
          else
            error.value = '尚无预览快照，请从编辑器重新打开预览。'
        }
        catch { error.value = '无法读取预览快照，请从编辑器重新打开预览。' }
      }
    }, 2000)
  }
  function stop() {
    if (stopped)
      return
    stopped = true
    pending = undefined
    clearTimeout(handshake)
    options.channel.removeEventListener('message', receive)
    options.channel.close()
  }
  options.channel.addEventListener('message', receive)
  connect()
  return {
    preview,
    revision,
    connection,
    loading,
    error,
    connect,
    stop,
    forget,
    retry() {
      if (last)
        enqueue(last, true)
      else connect()
    },
  }
}
