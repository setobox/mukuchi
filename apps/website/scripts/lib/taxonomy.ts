import type { Document } from '@xmldom/xmldom'
import assert from 'node:assert/strict'
import { taxonomyPath } from '../../shared/content/taxonomy.ts'

export function assertTaxonomyDirectory(document: Document, posts: readonly { tags: unknown, categories: unknown }[], field: 'tags' | 'categories') {
  const label = field === 'tags' ? '标签' : '分类'
  const path = `/${field}`
  assert.equal(document.getElementsByTagName('h1')[0]?.textContent?.trim(), label)
  assert.equal(document.getElementsByTagName('article').length, 0, `${path} 不展示文章卡片`)
  assert([...document.getElementsByTagName('link')].some(link => link.getAttribute('rel') === 'canonical' && link.getAttribute('href') === `https://blog.seto.box${path}`), `${path} 的正式链接`)
  assert([...document.getElementsByTagName('meta')].some(meta => meta.getAttribute('name') === 'description' && meta.getAttribute('content') === `浏览全部${label}及文章数量，找到感兴趣的内容。`), `${path} 的 SEO 简介`)
  const counts = new Map<string, number>()
  for (const post of posts) {
    const value = post[field]
    assert.equal(typeof value, 'string')
    const names: unknown = JSON.parse(value as string)
    assert(Array.isArray(names) && names.every((name): name is string => typeof name === 'string'))
    for (const name of new Set(names)) counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  const expected = [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  const entries = [...document.getElementsByTagName('a')].filter(link => link.getAttribute('aria-label')?.endsWith('篇文章'))
  const paths = expected.map(([name]) => taxonomyPath(field === 'tags' ? 'tag' : 'category', name))
  assert.deepEqual(entries.map(link => [link.getAttribute('href'), link.getAttribute('aria-label')]), expected.map(([name, count], index) => [paths[index], `${name}，${count} 篇文章`]), `${path} 的目录、计数、排序及编码链接`)
  assert(!document.toString().includes('正在加载'), `${path} 包含完整目录而非加载占位`)
  return paths
}
