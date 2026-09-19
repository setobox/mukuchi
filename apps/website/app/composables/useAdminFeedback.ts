interface AdminToast { id: string, message: string }

export function useAdminFeedback() {
  const toasts = useState<AdminToast[]>('admin:toasts', () => [])
  function dismiss(id: string) {
    toasts.value = toasts.value.filter(toast => toast.id !== id)
  }
  function notify(message: string) {
    if (!message)
      return
    toasts.value = [...toasts.value.slice(-2), { id: crypto.randomUUID(), message }]
  }
  return { toasts, notify, dismiss }
}
