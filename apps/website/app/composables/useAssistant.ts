import type { InjectionKey } from 'vue'
import type { AssistantController } from '~/features/assistant/controller'
import { createInjectionState, useEventListener, useIntervalFn } from '@vueuse/core'
import { createAssistantController } from '~/features/assistant/controller'
import { createLocalHistory } from '~/features/assistant/history'
import { memoryHistoryDatabase, openHistoryDatabase, resilientHistoryDatabase } from '~/features/assistant/storage'

export const assistantInjectionKey: InjectionKey<AssistantController> = Symbol('assistant')
const [useProvideAssistant, useInjectedAssistant] = createInjectionState(() => {
  const config = useRuntimeConfig()
  const route = useRoute()
  const router = useRouter()
  const auth = useAuthSession()
  const base = config.app.baseURL.replace(/\/$/, '')
  let ownerId = crypto.randomUUID()
  if (import.meta.client) {
    try {
      const stored = sessionStorage.getItem('assistant-tab-id')
      if (stored && /^[\da-f-]{36}$/.test(stored))
        ownerId = stored as typeof ownerId
      else sessionStorage.setItem('assistant-tab-id', ownerId)
    }
    catch { /* Only a random tab identifier lives here, never chat text or credentials. */ }
  }
  let channel: BroadcastChannel | null = null
  let ready: (history: ReturnType<typeof createLocalHistory>) => void = () => {}
  const history = new Promise<ReturnType<typeof createLocalHistory>>((resolve) => {
    ready = resolve
  })
  async function request(path: string, init?: RequestInit): Promise<unknown> {
    const response = await fetch(`${base}/api/assistant${path}`, { credentials: 'same-origin', cache: 'no-store', ...init })
    return response.json() as Promise<unknown>
  }
  const controller = createAssistantController({
    history,
    ownerId,
    transport: {
      session: () => request('/session'),
      post: (path, body, csrf, signal) => request(path, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, signal }),
    },
    navigate: async (path) => {
      const result = await router.push(path)
      if (result)
        throw new Error('导航未完成')
    },
  })
  const warn = () => {
    controller.storageWarning.value = '无法保存历史，当前聊天仅保留在此页面。已有本地记录不会被自动清理。'
  }
  onMounted(async () => {
    let db = memoryHistoryDatabase()
    try {
      db = resilientHistoryDatabase(await openHistoryDatabase(window.indexedDB), warn)
    }
    catch { warn() }
    try {
      channel = new BroadcastChannel('setobox-assistant')
      channel.onmessage = (event: MessageEvent<unknown>) => {
        if (event.data && typeof event.data === 'object' && 'namespace' in event.data && event.data.namespace === controller.session.value?.namespace)
          void controller.reload().catch(warn)
      }
    }
    catch { /* Server admission still guarantees concurrency if this API is unavailable. */ }
    ready(createLocalHistory(db, change => channel?.postMessage(change)))
    controller.routeChanged(route.path, String(route.meta.title ?? ''))
    await controller.refreshSession()
  })
  watch(() => route.path, path => controller.routeChanged(path, typeof document === 'undefined' ? '' : document.title))
  const unhook = useNuxtApp().hook('page:finish', () => {
    if (import.meta.client)
      controller.pageTitle.value = document.title
  })
  watch(() => auth.current.value.user?.id, () => {
    if (import.meta.client)
      void controller.refreshSession()
  })
  useIntervalFn(() => {
    if (controller.session.value)
      void controller.tick().catch(warn)
  }, 30_000)
  useEventListener(import.meta.client ? document : undefined, 'visibilitychange', () => {
    if (document.visibilityState === 'visible')
      void controller.tick().catch(warn)
  })
  onScopeDispose(() => {
    unhook()
    channel?.close()
    controller.dispose()
  })
  return controller
}, { injectionKey: assistantInjectionKey })
export { useProvideAssistant }
export function useAssistant() {
  return useInjectedAssistant()
}
