// @vitest-environment happy-dom
import type { AssistantTaskDetail } from '../shared/assistant/tasks'
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { computed, createApp, h, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import AssistantTasks from '../app/components/admin/AssistantTasks.vue'
import BaseSelect from '../app/components/base/BaseSelect.vue'
import BaseUiProvider from '../app/components/base/BaseUiProvider.vue'

const documentState = ref<'visible' | 'hidden'>('visible')
vi.mock('@vueuse/core', async original => ({
  ...await original<typeof import('@vueuse/core')>(),
  useDocumentVisibility: () => documentState,
}))
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
async function flush() {
  for (let i = 0;
    i < 12;
    i++) await nextTick()
}
const timestamp = Date.parse('2026-10-02T08:00:00Z')
function entry(): AssistantTaskDetail {
  return { id: crypto.randomUUID(), kind: 'test', configVersion: 1, status: 'failed', stage: 'reply', createdAt: timestamp, updatedAt: timestamp + 5000, finishedAt: timestamp + 5000, deadline: timestamp + 180000, modelCalls: 1, toolCalls: 0, historyCalls: 0, error: { code: 'model_failure', status: 503, upstreamStatus: 429, upstreamCode: 'rate_limit', requestId: 'fixture-request', message: '上游繁忙，请稍后重试' }, steps: [
    { id: crypto.randomUUID(), stage: 'task', label: '请求校验', status: 'completed', startedAt: timestamp, finishedAt: timestamp + 100, error: null },
    { id: crypto.randomUUID(), stage: 'review', label: '输入审核', status: 'completed', startedAt: timestamp + 100, finishedAt: timestamp + 2000, error: null },
    { id: crypto.randomUUID(), stage: 'reply', label: '模型调用', status: 'failed', startedAt: timestamp + 2000, finishedAt: timestamp + 5000, error: null },
  ] }
}
test('任务可筛选分页并显示阶段耗时、失败详情；可见时轮询，隐藏及卸载停止', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(timestamp + 5000)
  documentState.value = 'visible'
  const task = entry()
  const current = ref({ user: { role: 'admin' } })
  const focusId = ref('')
  const active = ref(true)
  const request = vi.fn(async (path: string) => path.startsWith('assistant/tasks?') ? { tasks: [task], total: 21, page: Number(new URLSearchParams(path.split('?')[1]).get('page')), pageSize: 20 } : task)
  for (const [name, value] of Object.entries({ computed, ref, watch, onBeforeUnmount, useAdminSession: () => ({ current, request }), adminError: String })) vi.stubGlobal(name, value)
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({ render: () => h(BaseUiProvider, null, { default: () => h(AssistantTasks, { revision: 1, focusId: focusId.value, active: active.value }) }) })
  app.component('BaseSelect', BaseSelect)
  app.component('BaseButton', { setup: (_, { slots }) => () => h('button', slots.default?.()) })
  app.component('AdminSkeleton', { render: () => h('div') })
  app.mount(host)
  try {
    await flush()
    expect(request).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(2000)
    expect(request).toHaveBeenCalledTimes(2)
    documentState.value = 'hidden'
    await flush()
    await vi.advanceTimersByTimeAsync(6000)
    expect(request).toHaveBeenCalledTimes(2)
    documentState.value = 'visible'
    await flush()
    expect(request).toHaveBeenCalledTimes(3)
    active.value = false
    await flush()
    await vi.advanceTimersByTimeAsync(6000)
    expect(request).toHaveBeenCalledTimes(3)
    active.value = true
    await flush()
    expect(request).toHaveBeenCalledTimes(4)
    focusId.value = task.id
    await flush()
    expect(request).toHaveBeenLastCalledWith(`assistant/tasks/${task.id}`)
    const phases = host.querySelector('[aria-label="任务阶段"]')!
    expect(phases.textContent).toContain('正在审核')
    expect(phases.textContent).toContain('1.9s')
    expect(phases.textContent).toContain('3.0s')
    expect(phases.lastElementChild?.textContent).toContain('尚未开始')
    expect(host.textContent).toContain('上游 HTTP 429')
    const kind = host.querySelector<HTMLButtonElement>('[role="combobox"][aria-label="任务类型"]')!
    expect(kind.textContent).toContain('全部任务')
    kind.focus()
    kind.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    await vi.waitFor(() => expect(document.querySelectorAll('[role="option"]')).toHaveLength(3))
    const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(item => item.textContent?.includes('测试任务'))!
    option.focus()
    option.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await vi.waitFor(() => expect(document.activeElement).toBe(kind))
    await flush()
    expect(request.mock.calls.some(([path]) => path.includes('kind=test'))).toBe(true)
    ;[...host.querySelectorAll('button')].find(button => button.textContent?.includes('下一页'))!.click()
    await flush()
    expect(request.mock.calls.some(([path]) => path.includes('page=2'))).toBe(true)
  }
  finally {
    app.unmount()
    host.remove()
  }
  const calls = request.mock.calls.length
  await vi.advanceTimersByTimeAsync(4000)
  expect(request).toHaveBeenCalledTimes(calls)
})
