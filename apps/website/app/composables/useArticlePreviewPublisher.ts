import type { PreviewSnapshot } from '#shared/admin/preview'
import { createPreviewPublisher, previewChannelName } from '~/features/admin/preview-sync'

export function useArticlePreviewPublisher(draftId: string, read: () => Omit<PreviewSnapshot, 'version'>) {
  const { current, endpoint } = useAdminSession()
  const error = ref('')
  let publisher: ReturnType<typeof createPreviewPublisher> | undefined
  let session = ''
  function disconnect() {
    publisher?.close()
    publisher = undefined
    session = ''
  }
  function open() {
    if (!import.meta.client || current.value.user?.role !== 'admin')
      return
    error.value = ''
    try {
      if (!publisher) {
        session = crypto.randomUUID()
        publisher = createPreviewPublisher(new BroadcastChannel(previewChannelName(current.value.user.id, draftId, session)), read)
      }
      const opened = window.open(endpoint(`/admin/preview/${draftId}?session=${session}`), '_blank')
      if (opened)
        opened.opener = null
      else
        error.value = '浏览器阻止了预览标签页，请允许本站弹出窗口后重试。'
    }
    catch { error.value = '无法打开实时预览，请使用支持 BroadcastChannel 的浏览器。' }
  }
  watch([() => current.value.user?.id, () => current.value.user?.role], disconnect)
  onMounted(() => {
    window.addEventListener('pagehide', disconnect)
  })
  onScopeDispose(() => {
    disconnect()
    if (import.meta.client)
      window.removeEventListener('pagehide', disconnect)
  })
  return { open, error, update: () => publisher?.update() }
}
