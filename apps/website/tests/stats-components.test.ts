// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { computed, createSSRApp, nextTick, onMounted, ref, watch } from 'vue'
import { renderToString } from 'vue/server-renderer'
import ArticleViews from '../app/components/stats/ArticleViews.vue'
import SiteStats from '../app/components/stats/SiteStats.vue'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
function setup() {
  const state = ref({ summary: { pageViews: 123456789, visitors: 20, startedAt: null }, pages: { '/posts/example': 42 }, errors: {} as Record<string, boolean> })
  for (const [name, value] of Object.entries({ computed, ref, onMounted, watch })) vi.stubGlobal(name, value)
  vi.stubGlobal('useVisitStats', () => ({ enabled: true, state, loadPage: vi.fn(), loadSummary: vi.fn() }))
  vi.stubGlobal('usePostCatalog', () => ({ data: ref([{ tags: ['Vue'], categories: ['开发'] }]), error: ref(null) }))
  return state
}

test('共享访问数据先到达时，SSR 与客户端仍以相同占位完成水合', async () => {
  setup()
  for (const component of [SiteStats, ArticleViews]) {
    const props = component === ArticleViews ? { path: '/posts/example' } : {}
    const html = await renderToString(createSSRApp(component, props))
    expect(html).toContain('加载中')
    expect(html).not.toContain('123,456,789')
    const host = document.createElement('div')
    host.innerHTML = html
    document.body.append(host)
    const warn = vi.spyOn(console, 'warn')
    const error = vi.spyOn(console, 'error')
    const app = createSSRApp(component, props)
    try {
      app.mount(host)
      await nextTick()
      expect(host.textContent).toContain(component === ArticleViews ? '浏览 42 次' : '123,456,789')
      expect(warn).not.toHaveBeenCalled()
      expect(error).not.toHaveBeenCalled()
    }
    finally {
      app.unmount()
      host.remove()
    }
  }
})

test('真实零值与加载失败可区分，失败不继续展示旧的浏览量', async () => {
  const state = setup()
  state.value.pages['/posts/example'] = 0
  const host = document.createElement('div')
  const app = createSSRApp(ArticleViews, { path: '/posts/example' })
  host.innerHTML = await renderToString(app)
  document.body.append(host)
  try {
    app.mount(host)
    await nextTick()
    expect(host.textContent).toBe('浏览 0 次')
    state.value.errors['/posts/example'] = true
    await nextTick()
    expect(host.textContent).toBe('浏览 — 次')
    expect(host.querySelector('span')?.getAttribute('aria-label')).toBe('浏览量暂时不可用')
  }
  finally {
    app.unmount()
    host.remove()
  }
})
