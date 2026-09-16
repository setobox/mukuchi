// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { computed, createApp, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import ArticleComments from '../app/components/comments/ArticleComments.client.vue'

afterEach(() => vi.unstubAllGlobals())

test('评论尚无讨论时显示可用空状态，真实错误提示重试且拒绝伪造消息', async () => {
  for (const [name, value] of Object.entries({ computed, ref, onMounted, onBeforeUnmount, useTemplateRef, watch })) vi.stubGlobal(name, value)
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { giscusRepo: 'test/comments', giscusRepoId: 'repo-id', giscusCategoryId: 'category-id' } }))
  vi.stubGlobal('useColorMode', () => ref('dark'))
  const host = document.createElement('div')
  const app = createApp(ArticleComments, { path: '/posts/example' })
  try {
    app.mount(host)
    // Simulate only the widget's message boundary; never load third-party JavaScript in tests.
    host.querySelector('script')!.removeAttribute('src')
    document.body.append(host)
    const frame = document.createElement('iframe')
    host.querySelector('script')!.parentElement!.append(frame)
    const send = (error: string, origin = 'https://giscus.app') => window.dispatchEvent(new MessageEvent('message', { origin, source: frame.contentWindow, data: { giscus: { error } } }))
    send('Discussion not found', 'https://other.example')
    await nextTick()
    expect(host.textContent).toContain('正在加载评论')
    send('Discussion not found')
    await nextTick()
    expect(host.textContent).not.toContain('正在加载评论')
    expect(host.textContent).not.toContain('评论暂时无法加载')
    send('API rate limit exceeded')
    await nextTick()
    expect(host.textContent).toContain('评论暂时无法加载')
    expect(host.querySelector('button')?.textContent).toContain('重试')
  }
  finally {
    app.unmount()
    host.remove()
  }
})
