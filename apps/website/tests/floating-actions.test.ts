// @vitest-environment happy-dom
import type { ActionButton } from '../app/composables/useActionButton'
import { expect, onTestFinished, test, vi } from 'vite-plus/test'
import { createApp, ref } from 'vue'
import FloatingActions from '../app/components/site/FloatingActions.vue'

test('AI 操作图标缩小，其他操作图标保持原样', () => {
  const actions = ref<ActionButton[]>([
    { id: 'assistant', icon: 'i-lucide-sparkles', label: 'AI 助手', onClick: vi.fn() },
    { id: 'other', icon: 'i-lucide-house', label: '其他操作', onClick: vi.fn() },
  ])
  vi.stubGlobal('useActionButtons', () => ({ actions }))

  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp(FloatingActions)
  app.mount(host)
  onTestFinished(() => {
    app.unmount()
    host.remove()
    vi.unstubAllGlobals()
  })

  const assistant = host.querySelector<HTMLButtonElement>('button[aria-label="AI 助手"]')
  const other = host.querySelector<HTMLButtonElement>('button[aria-label="其他操作"]')
  expect(assistant?.querySelector('span')?.classList.contains('text-[1.125rem]')).toBe(true)
  expect(other?.querySelector('span')?.classList.contains('text-[1.125rem]')).toBe(false)
  expect(assistant?.querySelectorAll('span')).toHaveLength(1)
})
