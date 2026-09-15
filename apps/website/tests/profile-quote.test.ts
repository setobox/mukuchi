// @vitest-environment happy-dom
import type { ProfileQuoteState } from '../app/features/profile/quote'
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { useProfileQuote } from '../app/composables/useProfileQuote'
import { loadProfileQuote, profileQuoteFallback, profileQuoteUrl } from '../app/features/profile/quote'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function quoteState() {
  return ref<ProfileQuoteState>({ status: 'idle', text: profileQuoteFallback })
}

test('加载中显示默认文案；成功后复用短句，不重复请求', async () => {
  const state = quoteState()
  let finish!: (value: unknown) => void
  const request = vi.fn(() => new Promise<unknown>((resolve) => {
    finish = resolve
  }))
  const pending = loadProfileQuote(state, request)
  expect(state.value).toEqual({ status: 'pending', text: profileQuoteFallback })
  await loadProfileQuote(state, request)
  expect(request).toHaveBeenCalledTimes(1)
  finish({ hitokoto: '  技术来自实践。  ' })
  await pending
  expect(state.value).toEqual({ status: 'success', text: '技术来自实践。' })
  await loadProfileQuote(state, request)
  expect(request).toHaveBeenCalledTimes(1)
})

test('网络错误和超时保留默认文案，后续挂载不自动重试', async () => {
  for (const error of [new Error('network unavailable'), new DOMException('timeout', 'TimeoutError')]) {
    const state = quoteState()
    const request = vi.fn().mockRejectedValue(error)
    await loadProfileQuote(state, request)
    await loadProfileQuote(state, request)
    expect(state.value).toEqual({ status: 'error', text: profileQuoteFallback })
    expect(request).toHaveBeenCalledTimes(1)
  }
})

test('拒绝空响应、错误类型、空白和超出长度限制的短句', async () => {
  for (const result of [null, {}, { hitokoto: 42 }, { hitokoto: '   ' }, { hitokoto: '短句' }, { hitokoto: '长'.repeat(25) }]) {
    const state = quoteState()
    await loadProfileQuote(state, async () => result)
    expect(state.value).toEqual({ status: 'error', text: profileQuoteFallback })
  }
  for (const length of [4, 24]) {
    const state = quoteState()
    await loadProfileQuote(state, async () => ({ hitokoto: '文'.repeat(length) }))
    expect(state.value.status).toBe('success')
  }
})

const Quote = defineComponent({
  setup() {
    const quote = useProfileQuote()
    return () => h('p', quote.value)
  },
})

test('SSR 只渲染默认短句，不请求外部接口或进入 pending 状态', async () => {
  const state = quoteState()
  const request = vi.fn()
  vi.stubGlobal('useState', () => state)
  vi.stubGlobal('$fetch', request)
  expect(await renderToString(h(Quote))).toContain(profileQuoteFallback)
  expect(request).not.toHaveBeenCalled()
  expect(state.value.status).toBe('idle')
})

test('客户端挂载使用三秒超时且不重试；多个实例共享请求，接口 HTML 仅作为文本', async () => {
  const state = quoteState()
  const request = vi.fn().mockResolvedValue({ hitokoto: '<b>仅显示文本</b>' })
  vi.stubGlobal('useState', () => state)
  vi.stubGlobal('$fetch', request)
  const host = document.createElement('div')
  const app = createApp({ render: () => h('div', [h(Quote), h(Quote)]) })
  try {
    app.mount(host)
    await Promise.resolve()
    await nextTick()
    expect(request).toHaveBeenCalledExactlyOnceWith(profileQuoteUrl, { timeout: 3000, retry: 0 })
    expect(host.querySelector('p')?.textContent).toBe('<b>仅显示文本</b>')
    expect(host.querySelector('b')).toBeNull()
  }
  finally {
    app.unmount()
  }
  const remount = createApp(Quote)
  try {
    remount.mount(host)
    await nextTick()
    expect(host.textContent).toBe('<b>仅显示文本</b>')
    expect(request).toHaveBeenCalledTimes(1)
  }
  finally {
    remount.unmount()
  }
})
