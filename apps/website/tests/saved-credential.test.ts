// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { computed, createApp, h, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import SavedCredential from '../app/components/admin/SavedCredential.vue'

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach(fn => fn())
  vi.unstubAllGlobals()
})
async function flush() {
  for (let i = 0;
    i < 12;
    i++) await nextTick()
}
function mount(request = vi.fn().mockResolvedValue({ value: 'saved-secret' })) {
  const current = ref({ user: { id: 'owner' } as { id: string } | null })
  for (const [name, value] of Object.entries({ computed, ref, watch, onBeforeUnmount, useId, useAdminSession: () => ({ current, request }), adminError: String })) vi.stubGlobal(name, value)
  const active = ref(true)
  const revision = ref(1)
  const draft = ref('')
  const edited = vi.fn((value: string) => draft.value = value)
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({ render: () => h(SavedCredential, { 'service': 'ai', 'field': 'apiKey', 'label': 'API 密钥', 'configured': true, 'revision': revision.value, 'active': active.value, 'modelValue': draft.value, 'onUpdate:modelValue': edited }) })
  app.mount(host)
  cleanups.push(() => {
    app.unmount()
    host.remove()
  })
  const input = host.querySelector('input')!
  const eye = host.querySelector('button')!
  async function edit(value: string) {
    input.value = value
    input.dispatchEvent(new Event('input'))
    await flush()
  }
  return { host, input, eye, draft, edited, edit, request, active, revision, current }
}
test('单个输入框查看已存密钥，聚焦、查看、隐藏不修改待保存值', async () => {
  const { host, eye, input, edited, request } = mount()
  input.focus()
  eye.click()
  await flush()
  expect(host.querySelectorAll('input')).toHaveLength(1)
  expect(input.value).toBe('saved-secret')
  expect(input.type).toBe('text')
  expect(eye.getAttribute('aria-label')).toBe('隐藏API 密钥')
  expect(edited).not.toHaveBeenCalled()
  eye.click()
  await flush()
  expect(input.type).toBe('password')
  expect(input.value).toBe('')
  expect(edited).not.toHaveBeenCalled()
  expect(request).toHaveBeenCalledExactlyOnceWith('ai/credentials/reveal', { method: 'POST', body: { field: 'apiKey' } })
})
test('新输入仅切换可见性，实际编辑才生成草稿，清空仍表示保留', async () => {
  const { eye, input, draft, edit, request } = mount()
  await edit('replacement')
  eye.click()
  await flush()
  expect(input.type).toBe('text')
  expect(draft.value).toBe('replacement')
  expect(request).not.toHaveBeenCalled()
  eye.click()
  await flush()
  await edit('')
  expect(draft.value).toBe('')
  eye.click()
  await flush()
  expect(input.value).toBe('saved-secret')
  await edit('edited-saved-secret')
  expect(draft.value).toBe('edited-saved-secret')
})
test.each(['page', 'save', 'logout'] as const)('%s 清理明文且迟到响应不能恢复', async (reason) => {
  const response = Promise.withResolvers<{ value: string }>()
  const request = vi.fn().mockResolvedValueOnce({ value: 'saved-secret' }).mockImplementationOnce(() => response.promise)
  const { eye, input, active, revision, current } = mount(request)
  eye.click()
  await flush()
  expect(input.value).toBe('saved-secret')
  eye.click()
  await flush()
  eye.click()
  await flush()
  expect(eye.disabled).toBe(true)
  if (reason === 'page')
    active.value = false
  if (reason === 'save')
    revision.value++
  if (reason === 'logout')
    current.value.user = null
  await flush()
  response.resolve({ value: 'late-secret' })
  await flush()
  expect(input.value).toBe('')
  expect(input.type).toBe('password')
})
test('读取失败后可通过眼睛重试；卸载丢弃在途结果', async () => {
  const response = Promise.withResolvers<{ value: string }>()
  const request = vi.fn().mockRejectedValueOnce(new Error('读取失败')).mockImplementationOnce(() => response.promise)
  const { host, eye, draft } = mount(request)
  eye.click()
  await flush()
  expect(host.querySelector('[role=alert]')?.textContent).toContain('读取失败')
  expect(eye.getAttribute('aria-label')).toContain('重试显示')
  eye.click()
  eye.click()
  await flush()
  expect(request).toHaveBeenCalledTimes(2)
  cleanups.splice(0).forEach(fn => fn())
  response.resolve({ value: 'late-secret' })
  await flush()
  expect(draft.value).toBe('')
})
