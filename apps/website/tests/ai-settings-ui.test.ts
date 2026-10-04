// @vitest-environment happy-dom
import type { Component } from 'vue'
import type { AiSettingsView } from '../shared/ai/model'
import type { AssistantSettingsView } from '../shared/assistant/settings'
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { computed, createApp, h, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import AiSettingsPanel from '../app/components/admin/AiSettingsPanel.vue'
import AssistantSettings from '../app/components/admin/AssistantSettings.vue'
import AudioSettings from '../app/components/admin/AudioSettings.vue'
import SavedCredential from '../app/components/admin/SavedCredential.vue'
import SummarySettings from '../app/components/admin/SummarySettings.vue'
import BaseButton from '../app/components/base/BaseButton.vue'
import BaseSelect from '../app/components/base/BaseSelect.vue'
import BaseSwitch from '../app/components/base/BaseSwitch.vue'
import BaseUiProvider from '../app/components/base/BaseUiProvider.vue'
import { defaultAiSettings } from '../shared/ai/model'
import { defaultAssistantSettings } from '../shared/assistant/settings'
import { defaultAudioSettings } from '../shared/audio/model'

interface RequestOptions { method?: string, body?: Record<string, unknown> }
const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach(fn => fn())
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
async function flush() {
  for (let i = 0;
    i < 20;
    i++) await nextTick()
}
function mount(component: Component, request: ReturnType<typeof vi.fn>) {
  const current = ref({ user: { id: 'owner', role: 'admin' } })
  for (const [name, value] of Object.entries({ computed, ref, watch, onBeforeUnmount, useId, useAdminSession: () => ({ current, request }), useRoute: () => ({ query: {} }), useAdminFeedback: () => ({ notify: vi.fn() }), adminError: (error: unknown) => String(error) })) vi.stubGlobal(name, value)
  const active = ref(true)
  const kind = ref<'narration' | 'podcast'>('narration')
  const view = ref<'config' | 'tasks'>('config')
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({ render: () => h(BaseUiProvider, null, { default: () => h(component, { ...(component === AudioSettings ? { kind: kind.value } : {}), 'active': active.value, 'view': view.value, 'onUpdate:view': (value: 'config' | 'tasks') => view.value = value }) }) })
  for (const [name, component] of Object.entries({ AiSettingsPanel, SavedCredential, BaseButton, BaseSelect, BaseSwitch })) app.component(name, component)
  for (const name of ['AdminSkeleton', 'BaseTag', 'AudioPlayer', 'ClientOnly']) app.component(name, { render: () => h('div') })
  app.component('SummaryManager', { render: () => h('div', '摘要任务列表') })
  app.component('AssistantTasks', { props: ['active', 'focusId'], setup: props => () => h('div', { 'data-focus-id': props.focusId, 'data-active': props.active }, '助手任务列表') })
  app.mount(host)
  cleanups.push(() => {
    app.unmount()
    host.remove()
  })
  function button(text: string) {
    const button = [...host.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.trim() === text)
    expect(button, text).toBeTruthy()
    return button!
  }
  function field(label: string) {
    const element = [...host.querySelectorAll('label')].find(item => item.textContent?.trim() === label)!
    expect(element, label).toBeTruthy()
    return (element.htmlFor ? document.getElementById(element.htmlFor) : element.querySelector('input,textarea')) as HTMLInputElement
  }
  async function edit(label: string, value: string) {
    const input = field(label)
    input.value = value
    input.dispatchEvent(new Event('input'))
    await flush()
  }
  return { host, active, view, kind, button, field, edit }
}
function summary() {
  return { ...defaultAiSettings, enabled: true, baseUrl: 'https://api.example.com/v1', model: 'fixture-model', version: 1, keyConfigured: true, encryptionReady: true } satisfies AiSettingsView
}
function assistant() {
  return { settings: { ...defaultAssistantSettings, enabled: true, baseUrl: 'https://api.example.com/v1', model: 'fixture-model', turnstileSiteKey: 'fixture-site' }, version: 1, configured: { modelKey: true, aliyunKeyId: true, aliyunKeySecret: true, turnstileSecret: true }, encryptionReady: true, verified: true } satisfies AssistantSettingsView
}

test('顶部保存并测试等待保存完成，防止重复提交；查看密钥不保存明文', async () => {
  let stored = summary()
  const saving = Promise.withResolvers<void>()
  const request = vi.fn(async (path: string, options?: RequestOptions) => {
    if (path === 'ai/credentials/reveal')
      return { value: 'fixture-secret' }
    if (path === 'ai/test')
      return { message: '连接成功' }
    if (options?.method === 'PUT') {
      await saving.promise
      stored = { ...stored, ...options.body, version: 2 }
    }
    return stored
  })
  const { host, button, edit, field } = mount(SummarySettings, request)
  await flush()
  expect(button('保存设置').disabled).toBe(true)
  host.querySelector<HTMLButtonElement>('[aria-label="显示已保存的API 密钥"]')!.click()
  await flush()
  expect(field('API 密钥').value).toBe('fixture-secret')
  expect(button('保存设置').disabled).toBe(true)
  await edit('模型', 'new-model')
  expect(host.textContent).toContain('有未保存修改')
  button('保存并测试').click()
  await flush()
  expect(button('保存中…').disabled).toBe(true)
  expect(button('保存并测试').disabled).toBe(true)
  button('保存并测试').click()
  expect(request.mock.calls.some(([path]) => path === 'ai/test')).toBe(false)
  saving.resolve()
  await flush()
  const put = request.mock.calls.find(([, options]) => options?.method === 'PUT')![1]!
  expect(put.body?.apiKey).toBeUndefined()
  expect(put.body?.clearKey).toBe(false)
  expect(request.mock.calls.filter(([path]) => path === 'ai/test')).toHaveLength(1)
  expect(field('API 密钥').value).toBe('')
  expect(host.textContent).toContain('连接成功')
  expect(button('保存设置').disabled).toBe(true)
})
test('保存失败停止测试并保留草稿；切换视图保留修改、清除已读取明文', async () => {
  const request = vi.fn(async (path: string, options?: RequestOptions) => {
    if (path === 'ai/credentials/reveal')
      return { value: 'fixture-secret' }
    if (options?.method === 'PUT')
      throw new Error('保存冲突')
    return summary()
  })
  const { host, button, edit, field, view, active } = mount(SummarySettings, request)
  await flush()
  await edit('模型', 'draft-model')
  host.querySelector<HTMLButtonElement>('[aria-label="显示已保存的API 密钥"]')!.click()
  await flush()
  button('任务').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  await flush()
  expect(view.value).toBe('tasks')
  expect(field('API 密钥').value).toBe('')
  button('配置').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  await flush()
  active.value = false
  await flush()
  active.value = true
  await flush()
  expect(field('模型').value).toBe('draft-model')
  button('保存并测试').click()
  await flush()
  expect(host.textContent).toContain('保存冲突')
  expect(field('模型').value).toBe('draft-model')
  expect(request.mock.calls.some(([path]) => path === 'ai/test')).toBe(false)
})
test('清空新密钥与明确删除保存不同请求', async () => {
  const request = vi.fn(async (_path: string, options?: RequestOptions) => ({ ...summary(), ...options?.body, version: options ? 2 : 1 }))
  const { host, button, edit } = mount(SummarySettings, request)
  await flush()
  await edit('API 密钥', 'new-key')
  await edit('API 密钥', '')
  expect(button('保存设置').disabled).toBe(true)
  host.querySelector<HTMLInputElement>('input[type=checkbox]')!.click()
  await flush()
  button('保存设置').click()
  await flush()
  expect(request.mock.calls.find(([, options]) => options?.method === 'PUT')![1]?.body).toMatchObject({ clearKey: true, apiKey: undefined })
})
test('助手关键配置保存后停用，测试定位任务，验证通过后由用户开启；次数调整保留验证', async () => {
  let stored: AssistantSettingsView = assistant()
  const testing = Promise.withResolvers<void>()
  const request = vi.fn(async (path: string, options?: RequestOptions) => {
    if (path === 'assistant/test') {
      await testing.promise
      stored = { ...stored, verified: true }
      return { message: '能力验证通过', taskId: options?.body?.requestId }
    }
    if (options?.method === 'PUT') {
      const settings = options.body?.settings as AssistantSettingsView['settings']
      stored = { ...stored, settings, version: stored.version + 1, verified: settings.model === stored.settings.model && stored.verified }
    }
    return stored
  })
  const { host, button, edit, view, field } = mount(AssistantSettings, request)
  await flush()
  await edit('访客每日提问次数', '12')
  expect(host.textContent).not.toContain('保存后需重新验证')
  button('保存设置').click()
  await flush()
  expect(stored.settings.enabled).toBe(true)
  expect(stored.verified).toBe(true)
  await edit('模型名称', 'new-model')
  expect(host.textContent).toContain('保存后需重新验证')
  button('保存并测试').click()
  await flush()
  expect(stored.settings.enabled).toBe(false)
  expect(stored.verified).toBe(false)
  expect(view.value).toBe('tasks')
  expect(button('测试中…').disabled).toBe(true)
  const run = request.mock.calls.find(([path]) => path === 'assistant/test')![1]!.body!
  expect(run.version).toBe(3)
  expect(host.querySelector('[data-focus-id]')?.getAttribute('data-focus-id')).toBe(run.requestId)
  button('配置').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  await flush()
  button('任务').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  await flush()
  expect(request.mock.calls.filter(([path]) => path === 'assistant/test')).toHaveLength(1)
  testing.resolve()
  await flush()
  expect(host.textContent).toContain('已通过验证')
  expect(stored.settings.enabled).toBe(false)
  host.querySelector<HTMLButtonElement>('[role=switch]')!.click()
  await flush()
  button('保存设置').click()
  await flush()
  expect(stored.settings.enabled).toBe(true)
  expect(stored.verified).toBe(true)
  expect(field('模型名称').value).toBe('new-model')
})

test('音频顶部保存当前类型及共用设置，跨功能保留草稿，隐藏任务停止轮询', async () => {
  vi.useFakeTimers()
  let stored = { ...defaultAudioSettings, narrationEnabled: true, podcastEnabled: true, version: 1, keyConfigured: true, encryptionReady: true, executionReady: true }
  const request = vi.fn(async (path: string, options?: RequestOptions) => {
    if (path === 'audio/jobs')
      return { jobs: [{ status: 'running' }], articles: [], usage: { day: '', narrationCharacters: 0, podcasts: 0 } }
    if (options?.method === 'PUT')
      stored = { ...stored, ...options.body, version: stored.version + 1 }
    return stored
  })
  const { host, button, edit, field, kind, view, active } = mount(AudioSettings, request)
  await flush()
  expect(request.mock.calls.filter(([path]) => path === 'audio/jobs')).toHaveLength(0)
  expect(button('保存设置').disabled).toBe(true)
  expect(host.querySelectorAll('[role=switch]')).toHaveLength(2)
  await edit('朗读音色 ID', 'narration-draft')
  kind.value = 'podcast'
  await flush()
  expect(button('保存设置').disabled).toBe(true)
  await edit('第一位主播音色 ID', 'podcast-draft')
  button('保存设置').click()
  await flush()
  expect(stored.podcastSpeaker1).toBe('podcast-draft')
  expect(stored.narrationSpeaker).toBe(defaultAudioSettings.narrationSpeaker)
  kind.value = 'narration'
  await flush()
  expect(field('朗读音色 ID').value).toBe('narration-draft')
  expect(button('保存设置').disabled).toBe(false)
  view.value = 'tasks'
  await flush()
  expect(request.mock.calls.filter(([path]) => path === 'audio/jobs')).toHaveLength(1)
  await vi.advanceTimersByTimeAsync(10000)
  expect(request.mock.calls.filter(([path]) => path === 'audio/jobs')).toHaveLength(2)
  active.value = false
  await flush()
  await vi.advanceTimersByTimeAsync(20000)
  expect(request.mock.calls.filter(([path]) => path === 'audio/jobs')).toHaveLength(2)
  active.value = true
  await flush()
  expect(request.mock.calls.filter(([path]) => path === 'audio/jobs')).toHaveLength(3)
  view.value = 'config'
  await flush()
  await vi.advanceTimersByTimeAsync(20000)
  expect(request.mock.calls.filter(([path]) => path === 'audio/jobs')).toHaveLength(3)
})

test.each([
  { component: SummarySettings, response: summary },
  { component: AssistantSettings, response: assistant },
])('设置读取失败后可重试，成功即清除旧错误：$component.__name', async ({ component, response }) => {
  const request = vi.fn().mockRejectedValueOnce(new Error('读取失败')).mockImplementation(async () => response())
  const { host, button } = mount(component, request)
  await flush()
  expect(host.querySelector('[role=alert]')?.textContent).toContain('读取失败')
  button('重试').click()
  await flush()
  expect(host.querySelector('[role=alert]')).toBeNull()
  expect(host.textContent).toContain('已保存')
})
