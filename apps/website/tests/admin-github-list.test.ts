import { Buffer } from 'node:buffer'
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { createGithubContentCache } from '../server/features/publishing/content-cache'
import { createGithub } from '../server/features/publishing/github'

const options = { repository: 'test/blog', branch: 'main', token: 'test-token' }
const sha = (value: number) => value.toString(16).padStart(40, '0')
const entry = (value: number) => ({ path: `content/posts/${value}.md`, type: 'blob', mode: '100644', sha: sha(value) })
function fixture(count: number, delay = 0) {
  const state = { entries: Array.from({ length: count }, (_, index) => entry(index + 1)), authorized: true, failed: '', active: 0, peak: 0, truncated: false }
  const request = vi.fn<typeof fetch>(async (url) => {
    const path = new URL(String(url)).pathname
    if (!state.authorized)
      return new Response(null, { status: 403 })
    if (path.includes('/git/ref/'))
      return Response.json({ object: { sha: sha(100) } })
    if (path.includes('/git/commits/'))
      return Response.json({ tree: { sha: sha(101) } })
    if (path.includes('/git/trees/'))
      return Response.json({ sha: sha(101), tree: state.entries, truncated: state.truncated })
    const hash = path.split('/').at(-1)!
    state.active++
    state.peak = Math.max(state.peak, state.active)
    try {
      if (delay)
        await new Promise(resolve => setTimeout(resolve, delay))
      if (hash === state.failed)
        return new Response(null, { status: 503 })
      const source = Buffer.from(`文章 ${hash}`, 'utf8')
      return Response.json({ encoding: 'base64', size: source.length, content: source.toString('base64') })
    }
    finally { state.active-- }
  })
  const blobs = () => request.mock.calls.filter(([url]) => String(url).includes('/git/blobs/'))
  return { state, request, blobs }
}

afterEach(() => vi.useRealTimers())

test('列表限量并发读取正文并保持目录顺序，13 篇耗时为三轮而非逐篇累加', async () => {
  vi.useFakeTimers()
  const { state, request } = fixture(13, 100)
  const start = Date.now()
  const pending = createGithub(options, request).list()
  await vi.runAllTimersAsync()
  const files = await pending
  expect(state.peak).toBe(6)
  expect(Date.now() - start).toBe(300)
  expect(files.map(file => file.path)).toEqual(state.entries.map(file => file.path.slice(14)))
  expect(files[0]?.source).toBe(`文章 ${sha(1)}`)
})

test('跨请求复用未改正文，每次仍读最新目录；新增、修改、删除和分支变化立即生效', async () => {
  const { state, request, blobs } = fixture(3)
  const cache = createGithubContentCache()
  const client = (branch = 'main') => createGithub({ ...options, branch }, request, cache)
  await client().list()
  expect(blobs()).toHaveLength(3)
  request.mockClear()
  await client().list()
  expect(blobs()).toHaveLength(0)
  expect(request).toHaveBeenCalledTimes(3)
  state.entries = [entry(1), { ...entry(2), sha: sha(4) }, entry(5)]
  expect(await client().list()).toEqual([
    { path: '1.md', source: `文章 ${sha(1)}`, hash: sha(1) },
    { path: '2.md', source: `文章 ${sha(4)}`, hash: sha(4) },
    { path: '5.md', source: `文章 ${sha(5)}`, hash: sha(5) },
  ])
  expect(blobs()).toHaveLength(2)
  request.mockClear()
  state.entries = [entry(8)]
  expect(await client('drafts').read('8.md')).toMatchObject({ source: `文章 ${sha(8)}` })
  expect(String(request.mock.calls[0]?.[0])).toContain('/git/ref/heads/drafts')
  expect(await client().read('1.md')).toBeNull()
})

test('缓存不跨仓库复用，不绕过凭据验证，也不保留失败响应', async () => {
  const { state, request, blobs } = fixture(1)
  const cache = createGithubContentCache()
  const client = () => createGithub(options, request, cache)
  state.failed = sha(1)
  await expect(client().list()).rejects.toMatchObject({ statusCode: 503 })
  state.failed = ''
  expect(await client().list()).toHaveLength(1)
  expect(blobs()).toHaveLength(2)
  await createGithub({ ...options, repository: 'other/blog' }, request, cache).list()
  expect(blobs()).toHaveLength(3)
  state.authorized = false
  await expect(client().list()).rejects.toMatchObject({ statusCode: 503 })
  await expect(createGithub({ ...options, token: '' }, request, cache).list()).rejects.toMatchObject({ statusCode: 503 })
  expect(blobs()).toHaveLength(3)
})

test('目录不完整时拒绝列表，符号链接和文章目录外文件不会被下载', async () => {
  const { state, request, blobs } = fixture(1)
  state.entries.push({ ...entry(2), mode: '120000' }, { ...entry(3), path: 'README.md' })
  expect(await createGithub(options, request).list()).toHaveLength(1)
  expect(blobs()).toHaveLength(1)
  state.truncated = true
  await expect(createGithub(options, request).list()).rejects.toMatchObject({ statusCode: 503 })
  expect(blobs()).toHaveLength(1)
})

test('正文缓存限制总大小，淘汰最久未使用项，超大项不会挤掉已有内容', () => {
  const cache = createGithubContentCache(24)
  cache.set('a', '1', 'one')
  cache.set('a', '2', 'two')
  expect(cache.get('a', '1')).toBe('one')
  cache.set('a', '3', 'new')
  expect(cache.get('a', '2')).toBeUndefined()
  expect(cache.get('a', '1')).toBe('one')
  cache.set('a', '4', 'too large for this cache')
  expect(cache.get('a', '3')).toBe('new')
  expect(cache.get('a', '4')).toBeUndefined()
  cache.set('a', '1', '')
  expect(cache.get('a', '1')).toBe('')
})
