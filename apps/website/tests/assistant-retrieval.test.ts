import { expect, test } from 'vite-plus/test'
import { createPublicContent } from '../server/features/assistant/content'
import { articlePathSchema } from '../shared/assistant/model'
import { recallArticles, recallTerms } from '../shared/assistant/retrieval'
import { prepareSearchDocuments } from '../shared/content/search'

test('短英文别名不会命中另一个单词内部，中文同义表达可以召回', () => {
  const documents = prepareSearchDocuments(['TypeScript 入门', 'Posts index', 'Air travel', '大模型介绍'].map((title, i) => ({ id: `/posts/${i}`, path: `/posts/${i}`, title, titles: [], content: '', description: '', categories: [], tags: [], pin: 0, publish: '2026-09-30' })))
  expect(recallArticles(documents, 'TS', { limit: 5 }).map(item => item.title)).toEqual(['TypeScript 入门'])
  expect(recallArticles(documents, 'AI', { limit: 5 })).toEqual([])
  expect(recallArticles(documents, 'LLM', { limit: 5 }).map(item => item.title)).toEqual(['大模型介绍'])
  expect(recallTerms('node.js')).toEqual([['node.js', 'nodejs', 'node']])
})

test('导航地址拒绝编码控制字符、查询参数和路径穿越', () => {
  for (const path of ['/posts/%0afoo', '/posts/%3fx', '/posts/%2e%2e/admin', '/posts/a%5cb', '/posts/%00'])
    expect(articlePathSchema.safeParse(path).success).toBe(false)
  expect(articlePathSchema.safeParse('/posts/%E4%B8%AD%E6%96%87').success).toBe(true)
})

test('热门推荐使用已发布集合的真实阅读排序，移除下线地址；统计不可用时明确普通推荐', async () => {
  const documents = prepareSearchDocuments(['文章 A', '文章 B'].map((title, index) => ({ id: `/posts/${index}`, path: `/posts/${index}`, title, titles: [], content: '', description: '', categories: [], tags: [], pin: 0, publish: '2026-09-30' })))
  const source = { sections: async () => documents, siteInfo: async () => ({ rss: 'https://blog.test/rss.xml' }) }
  const popular = createPublicContent({ ...source, popular: async () => ['/posts/removed', '/posts/1', '/posts/0'] })
  expect(await popular.popular(1)).toMatchObject({ articles: [{ title: '文章 B' }], ranking: '阅读量' })
  const unavailable = createPublicContent({ ...source, popular: async () => {
    throw new Error('offline')
  } })
  expect(await unavailable.popular(2)).toMatchObject({ articles: [{ title: '文章 A' }, { title: '文章 B' }], ranking: '普通推荐（暂无可用阅读统计）' })
})
