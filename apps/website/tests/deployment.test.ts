// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { computed, createSSRApp, nextTick, onMounted, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'
import ArticleNotices from '../app/components/posts/ArticleNotices.vue'
import { pageUrl } from '../shared/site/url'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

test('正式链接只使用配置域名，保留路径编码并去掉查询参数和锚点', () => {
  for (const path of ['/posts/markdown/markdown', '/categories/内容管理', '/tags/C%23', '/tags/C%2B%2B', '/tags/%2523']) {
    const url = new URL(pageUrl('https://blog.setobox.me', '/', `${path}?tag=old#section`))
    expect(url.origin).toBe('https://blog.setobox.me')
    expect(decodeURI(url.pathname)).toBe(decodeURI(path))
    expect(url.search).toBe('')
    expect(url.hash).toBe('')
  }
  expect(pageUrl('https://blog.setobox.me', '/blog/', '/posts/example')).toBe('https://blog.setobox.me/blog/posts/example')
})

test('站点地址拒绝非 HTTP 地址、凭据和不明确的前缀，页面不能跳转站外', () => {
  for (const origin of ['invalid', 'javascript:alert(1)', 'https://user:pass@example.com', 'https://example.com/blog', 'https://example.com/?q=1', 'https://example.com/#hash'])
    expect(() => pageUrl(origin, '/', '/posts')).toThrow()
  for (const path of ['//evil.example', '/\\evil.example', 'https://evil.example'])
    expect(() => pageUrl('https://blog.setobox.me', '/', path)).toThrow()
})

test('预渲染文章以构建日完成 hydration，挂载后按当前上海日期显示时效提醒', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-15T04:00:00Z'))
  const day = ref('2025-01-01')
  vi.stubGlobal('computed', computed)
  vi.stubGlobal('onMounted', onMounted)
  vi.stubGlobal('useState', () => day)
  vi.stubGlobal('useNuxtApp', () => ({ isHydrating: true }))
  vi.stubGlobal('useAppConfig', () => ({ site: { article: { notices: { wip: true, staleAfterDays: 365 } } } }))
  const makeApp = () => createSSRApp(ArticleNotices, {
    path: '/posts/test',
    post: { publish: '2025-01-01', wip: false },
  }).component('AppIcon', { template: '<span />' })
  const html = await renderToString(makeApp())
  expect(html).not.toContain('内容时效提醒')
  const target = document.createElement('div')
  target.innerHTML = html
  document.body.append(target)
  const app = makeApp()
  try {
    app.mount(target)
    await nextTick()
    expect(target.textContent).toContain('内容时效提醒')
    expect(day.value).toBe('2026-09-15')
  }
  finally {
    app.unmount()
    target.remove()
  }
})
