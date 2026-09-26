import type { SearchSection } from '../app/features/search/model'
import { expect, test, vi } from 'vite-plus/test'
import { createSearchLoader } from '../app/features/search/loader'
import { highlightParts, prepareSearchDocuments, searchArticles } from '../app/features/search/model'

function section(overrides: Partial<SearchSection> = {}): SearchSection {
  return {
    path: '/posts/example',
    id: '/posts/example',
    title: 'Nuxt 使用教程',
    titles: [],
    description: '框架配置说明',
    content: '文章介绍',
    tags: ['Vue'],
    categories: ['技术'],
    pin: 0,
    publish: '2026-09-14',
    ...overrides,
  }
}
const chapters = [
  section(),
  section({ id: '/posts/example#配置', title: '配置', titles: ['Nuxt 使用教程'], content: '中文全文搜索 const foo = defineNuxtConfig()' }),
  section({ id: '/posts/example#配置-1', title: '配置', titles: ['Nuxt 使用教程'], content: 'MDC 插槽文字使用指南' }),
]

test('中文子串、英文大小写、标签和章节正文可以共同匹配', () => {
  const documents = prepareSearchDocuments(chapters)
  expect(searchArticles(documents, '  nUXt Vue 全文  ').results[0]?.id).toBe('/posts/example#配置')
  expect(searchArticles(documents, '技术 框架').results[0]?.id).toBe('/posts/example')
  expect(searchArticles(documents, 'definenuxtconfig').results[0]?.section).toBe('配置')
  expect(searchArticles(documents, '插槽').results[0]?.id).toBe('/posts/example#配置-1')
  expect(searchArticles(documents, '全文 插槽').total).toBe(0)
  expect(searchArticles(documents, '   ').total).toBe(0)
})

test('同篇文章只显示最佳命中，重复标题保留原始锚点，无效锚点回到文章', () => {
  expect(searchArticles(prepareSearchDocuments(chapters), '配置').results).toHaveLength(1)
  for (const anchor of ['undefined', 'null', '', '错误 锚点']) {
    const documents = prepareSearchDocuments([section(), section({ id: `/posts/example#${anchor}`, content: '唯一命中' })])
    expect(searchArticles(documents, '唯一命中').results[0]?.id).toBe('/posts/example')
  }
})

test('标题优先于章节和正文，同分按置顶、日期、路径稳定排序', () => {
  const documents = prepareSearchDocuments([
    section({ path: '/posts/c', id: '/posts/c', title: '正文匹配', content: '关键词', pin: 9 }),
    section({ path: '/posts/b', id: '/posts/b', title: '关键词标题', pin: 1 }),
    section({ path: '/posts/a', id: '/posts/a', title: '关键词标题', pin: 1 }),
    section({ path: '/posts/old', id: '/posts/old', title: '关键词标题', pin: 1, publish: '2025-01-01' }),
  ])
  expect(searchArticles(documents, '关键词').results.map(result => result.id)).toEqual(['/posts/a', '/posts/b', '/posts/old', '/posts/c'])
})

test('超过二十篇返回总数和前二十篇，摘要截取命中附近文本', () => {
  const documents = prepareSearchDocuments(Array.from({ length: 24 }, (_, index) => section({
    path: `/posts/${index}`,
    id: `/posts/${index}#正文`,
    title: '正文',
    titles: ['教程'],
    content: `${'前文'.repeat(100)}目标${'后文'.repeat(100)}`,
  })))
  const match = searchArticles(documents, '目标')
  expect(match.total).toBe(24)
  expect(match.results).toHaveLength(20)
  expect(match.results[0]?.excerpt).toContain('目标')
  expect(match.results[0]?.excerpt.startsWith('…')).toBe(true)
})

test('搜索相关性优先，同分结果沿用文章日期与序号排序', () => {
  const documents = prepareSearchDocuments([
    section({ path: '/posts/a', id: '/posts/a', stem: '0.folder/plain', title: '关键词' }),
    section({ path: '/posts/ten', id: '/posts/ten', stem: '0.folder/10.ten', title: '关键词' }),
    section({ path: '/posts/two', id: '/posts/two', stem: '99.folder/02.two', title: '关键词' }),
    section({ path: '/posts/new', id: '/posts/new', publish: '2026-09-15', title: '关键词' }),
    section({ path: '/posts/body', id: '/posts/body', publish: '2026-09-16', content: '关键词', pin: 9 }),
  ])
  expect(searchArticles(documents, '关键词').results.map(result => result.id)).toEqual([
    '/posts/new',
    '/posts/ten',
    '/posts/two',
    '/posts/a',
    '/posts/body',
  ])
})

test('高亮输出纯文本分段，合并重叠关键词且不解释 HTML 或正则', () => {
  const text = '<script>alert(1)</script> Nuxt'
  const parts = highlightParts(text, '<script> NUXT ux')
  expect(parts.map(part => part.text).join('')).toBe(text)
  expect(parts.filter(part => part.marked).map(part => part.text)).toEqual(['<script>', 'Nuxt'])
  expect(highlightParts('a.*b', '.*')).toContainEqual({ text: '.*', marked: true })
})

test('索引边界拒绝外站路径和无效元数据', () => {
  expect(() => prepareSearchDocuments([section({ path: 'https://example.com' })])).toThrow()
  expect(() => prepareSearchDocuments([section({ pin: -1 })])).toThrow()
  expect(() => prepareSearchDocuments([{ id: '/posts/a' }])).toThrow()
})

test('索引按需加载、共享并发请求，成功后复用缓存', async () => {
  const fetch = vi.fn(async () => chapters)
  const loader = createSearchLoader(fetch)
  expect(fetch).not.toHaveBeenCalled()
  const first = loader.load()
  expect(loader.load()).toBe(first)
  await first
  await loader.load()
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(loader.status.value).toBe('ready')
})

test('失败保留错误且可重试，空文章集合是成功状态', async () => {
  const error = new Error('网络不可用')
  const fetch = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce([])
  const loader = createSearchLoader(fetch)
  await loader.load()
  expect(loader.status.value).toBe('error')
  expect(loader.error.value).toBe(error)
  await loader.load()
  expect(loader.status.value).toBe('ready')
  expect(loader.documents.value).toEqual([])
})

test('失效的旧请求不能覆盖新索引或新错误', async () => {
  let resolveOld!: (value: unknown) => void
  const fetch = vi.fn().mockImplementationOnce(() => new Promise(resolve => resolveOld = resolve)).mockResolvedValueOnce([])
  const loader = createSearchLoader(fetch)
  const old = loader.load()
  await Promise.resolve()
  loader.reset()
  await loader.load()
  resolveOld(chapters)
  await old
  expect(loader.status.value).toBe('ready')
  expect(loader.documents.value).toEqual([])
})
