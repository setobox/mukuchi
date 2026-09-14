import { parseMarkdown } from '@nuxtjs/mdc/runtime'
import MDCRenderer from '@nuxtjs/mdc/runtime/components/MDCRenderer.vue'
import { expect, test, vi } from 'vite-plus/test'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import Github from '../app/components/content/Github.vue'
import { collectRepositories } from '../content/github/scan'
import { createSnapshotCollector, publicRepository } from '../content/github/snapshots'
import { repositoryCount, repositoryIdSchema } from '../shared/github/repository'

const responseData = {
  private: false,
  full_name: 'nuxt/content',
  owner: { avatar_url: 'https://avatars.githubusercontent.com/u/23360933' },
  description: 'Content module',
  stargazers_count: 12345,
  forks_count: 0,
  license: { spdx_id: 'MIT' },
  language: 'TypeScript',
  secret: 'must not be included',
}

test('真实 MDC 提取仓库引用并去重，不请求代码围栏和普通链接', async () => {
  expect(await collectRepositories([
    { filename: '文章.md', source: '::github{repo="Nuxt/Content"}\n::\n\n```md\n::github{repo="not/requested"}\n::\n```\n\n[repo](https://github.com/other/repo)' },
    { filename: 'about.md', source: '::github{repo="nuxt/content"}\n::' },
  ])).toEqual(['Nuxt/Content'])
})

test('未闭合、插槽内容和非法仓库标识报告来源文件', async () => {
  for (const source of ['::github{repo="nuxt/content"}', '::github{repo="nuxt/content"}\n\n后续正文', '::github{repo="nuxt/content"}\n内容\n::', '::github{repo="../secret"}\n::', '::github{:repo="value"}\n::'])
    await expect(collectRepositories([{ filename: '错误文章.md', source }])).rejects.toThrow('错误文章.md:1')
  for (const repo of ['nuxt/..', 'nuxt/.', 'nuxt/content?x=1', 'https://github.com/nuxt/content', 'nuxt/content/path'])
    expect(repositoryIdSchema.safeParse(repo).success).toBe(false)
  expect(repositoryIdSchema.safeParse('nuxt/.github').success).toBe(true)
})

test('公开仓库字段白名单、缺失信息和真实零值', () => {
  const data = publicRepository(responseData)
  expect(data).toMatchObject({ stars: 12345, forks: 0, license: 'MIT' })
  expect(data).not.toHaveProperty('secret')
  expect(publicRepository({ ...responseData, description: '', license: { spdx_id: 'NOASSERTION' }, language: null })).toMatchObject({ description: null, license: null, language: null })
  expect(publicRepository({ ...responseData, owner: { avatar_url: 'https://untrusted.example/avatar' } }).avatar).toBeNull()
  expect(repositoryCount(null)).toBe('-')
  expect(repositoryCount(0)).toBe('0')
  expect(repositoryCount(12345)).toBe('12.3K')
})

test('快照在一次会话中去重，新会话重新获取，凭据不进入输出', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => Response.json(responseData))
  const warn = vi.fn()
  const collect = createSnapshotCollector({ fetch, warn, token: 'test-token' })
  const result = await collect(['nuxt/content', 'NUXT/CONTENT'])
  await collect(['nuxt/content'])
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(fetch.mock.calls[0]?.[1]).toMatchObject({ redirect: 'error', headers: { Authorization: 'Bearer test-token' } })
  expect(JSON.stringify(result)).not.toContain('test-token')
  expect(result['nuxt/content']?.forks).toBe(0)
  await createSnapshotCollector({ fetch, warn })(['nuxt/content'])
  expect(fetch).toHaveBeenCalledTimes(2)
})

test('私有数据、损坏响应和不可访问仓库均降级，不输出敏感内容', async () => {
  for (const response of [Response.json({ ...responseData, private: true }), Response.json({ token: 'private-secret' }), new Response(null, { status: 404 })]) {
    const warn = vi.fn()
    const collect = createSnapshotCollector({ fetch: vi.fn<typeof globalThis.fetch>().mockResolvedValue(response), warn })
    const snapshots = await collect(['nuxt/content'])
    expect(snapshots['nuxt/content']).toMatchObject({ description: null, stars: null, avatar: null })
    expect(JSON.stringify(snapshots)).not.toContain('private-secret')
    expect(warn).toHaveBeenCalledTimes(1)
  }
})

test('限流后停止剩余请求，未取得的数据保留占位', async () => {
  for (const response of [new Response(null, { status: 429 }), new Response(null, { status: 403, headers: { 'x-ratelimit-remaining': '0' } }), Response.json({ message: 'secondary rate limit' }, { status: 403 })]) {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response)
    const collect = createSnapshotCollector({ fetch, warn: vi.fn() })
    expect(await collect(['one/repo', 'two/repo'])).toMatchObject({ 'one/repo': { stars: null }, 'two/repo': { stars: null } })
    await collect(['three/repo'])
    expect(fetch).toHaveBeenCalledTimes(1)
  }
})

test('八秒超时取消请求且不重试，日志不包含原始错误', async () => {
  vi.useFakeTimers()
  try {
    const warn = vi.fn()
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation((_, init) => new Promise((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('secret-request-header')))
    }))
    const pending = createSnapshotCollector({ fetch, warn })(['nuxt/content'])
    await vi.advanceTimersByTimeAsync(8000)
    expect((await pending)['nuxt/content']?.stars).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('超过 8 秒'))
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret-request-header')
  }
  finally {
    vi.useRealTimers()
  }
})

test('真实 MDC 的卡片 SSR 完整输出，多个实例和后续正文保持独立', async () => {
  const parsed = await parseMarkdown('::github{repo="nuxt/content"}\n::\n\n::github{repo="missing/repo"}\n::\n\n后续正文', { highlight: false })
  const app = createSSRApp({ render: () => h(MDCRenderer, { body: parsed.body, data: parsed.data, components: { github: Github, p: 'p' } }) })
  const html = await renderToString(app)
  expect(html.match(/data-prose-card="github"/g)).toHaveLength(2)
  expect(html).toContain('href="https://github.com/nuxt/content" target="_blank" rel="noopener noreferrer"')
  expect(html).toContain('12.3K')
  expect(html).toContain('Star：12,345')
  expect(html).toContain('Fork：0')
  expect(html).toContain('&lt;script&gt;unsafe()&lt;/script&gt;')
  expect(html).toContain('loading="lazy"')
  expect(html).toContain('许可证：暂无数据')
  expect(html).toContain('>0</span>')
  expect(html).toContain('>-</span>')
  expect(html).toContain('<p>后续正文</p>')
  expect(html).not.toMatch(/<a[^>]*>[\s\S]*<(?:button|h[1-6])\b/)
  expect(html).not.toContain('api.github.com')
})
