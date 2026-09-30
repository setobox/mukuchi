// @vitest-environment happy-dom
import type { AssistantUsage } from '../shared/assistant/budget'
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { createApp, h, nextTick, ref } from 'vue'
import AssistantBudget from '../app/components/admin/AssistantBudget.vue'
import BaseButton from '../app/components/base/BaseButton.vue'

afterEach(() => vi.unstubAllGlobals())
async function flush() {
  for (let i = 0; i < 5; i++) await nextTick()
}
const full: AssistantUsage = { day: '2026-09-30', limitMicros: 10_000_000, spentMicros: 8_000_000, reservedMicros: 2_000_000, totalSpentMicros: 8_000_000, resetMicros: 0 }
async function setup(request: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('useAdminSession', () => ({ current: ref({ user: { role: 'admin' } }), request }))
  vi.stubGlobal('adminError', (cause: Error) => cause.message)
  const refreshKey = ref(0)
  const edit = vi.fn()
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({ render: () => h(AssistantBudget, { refreshKey: refreshKey.value, onEditLimit: edit }) })
  app.component('BaseButton', BaseButton)
  app.mount(host)
  await flush()
  const click = async (text: string) => {
    const button = [...host.querySelectorAll('button')].find(item => item.textContent?.trim() === text)
    expect(button).toBeDefined()
    button!.click()
    await flush()
  }
  return {
    host,
    refreshKey,
    edit,
    click,
    cleanup() {
      app.unmount()
      host.remove()
    },
  }
}

test('满额显示进度和操作入口；确认后重置，仅清除已结算占用', async () => {
  const request = vi.fn(async (path: string) => path === 'assistant/usage/reset' ? { ...full, spentMicros: 0, resetMicros: 8_000_000 } : full)
  const ui = await setup(request)
  try {
    expect(ui.host.querySelector('progress')?.value).toBe(10_000_000)
    expect(ui.host.querySelector('progress')?.max).toBe(10_000_000)
    expect(ui.host.textContent).toContain('今日额度已达上限')
    await ui.click('调整额度上限')
    expect(ui.edit).toHaveBeenCalledOnce()
    await ui.click('重置今日额度')
    expect(request).toHaveBeenCalledTimes(1)
    expect(ui.host.textContent).toContain('供应商已产生的费用不会清零')
    await ui.click('确认重置')
    expect(request).toHaveBeenLastCalledWith('assistant/usage/reset', { method: 'POST', body: { day: full.day, resetMicros: 0 } })
    expect(ui.host.querySelector('progress')?.value).toBe(2_000_000)
    expect(ui.host.textContent).not.toContain('今日额度已达上限')
    expect(ui.host.textContent).toContain('处理中预留额度已保留')
    expect([...ui.host.querySelectorAll('button')].find(item => item.textContent?.trim() === '重置今日额度')?.disabled).toBe(true)
  }
  finally { ui.cleanup() }
})

test('重置冲突显示提示并刷新；刷新可显示新预算及跨日用量', async () => {
  let snapshot = full
  const request = vi.fn(async (path: string) => {
    if (path === 'assistant/usage/reset') {
      snapshot = { ...full, spentMicros: 0, resetMicros: 8_000_000 }
      throw new Error('额度已被重置，请刷新后重试')
    }
    return snapshot
  })
  const ui = await setup(request)
  try {
    await ui.click('重置今日额度')
    await ui.click('确认重置')
    expect(ui.host.querySelector('[role="alert"]')?.textContent).toContain('额度已被重置')
    expect(ui.host.querySelector('progress')?.value).toBe(2_000_000)
    snapshot = { ...full, day: '2026-10-01', spentMicros: 0, reservedMicros: 0, totalSpentMicros: 0, limitMicros: 20_000_000 }
    ui.refreshKey.value++
    await flush()
    expect(ui.host.querySelector('progress')?.value).toBe(0)
    expect(ui.host.querySelector('progress')?.max).toBe(20_000_000)
    expect(ui.host.textContent).toContain('2026-10-01')
  }
  finally { ui.cleanup() }
})
