import { expect, test } from 'vite-plus/test'
import { paginatePosts, parsePostPage, postPageNumbers } from '../app/features/posts/pagination'
import { filterPosts, sortPosts } from '../shared/content/catalog'

test.each([undefined, null, '', '0', '-1', '1.5', '2abc', ' 2', '02', '1e2', 'Infinity', '9007199254740992', ['2'], ['2', '3']])('非法页码 %j 回到第一页', (value) => {
  expect(parsePostPage(value)).toBe(1)
})

test.each([
  [0, undefined, 1, 1, 0],
  [1, undefined, 1, 1, 1],
  [10, '1', 1, 1, 10],
  [11, '2', 2, 2, 1],
  [21, '1', 1, 3, 10],
  [21, '2', 2, 3, 10],
  [21, '3', 3, 3, 1],
  [21, '999', 3, 3, 1],
] as const)('%i 篇文章请求第 %s 页的边界正确', (total, value, page, pageCount, count) => {
  const posts = Array.from({ length: total }, (_, index) => index)
  const result = paginatePosts(posts, value)
  expect(result).toMatchObject({ total, page, pageCount })
  expect(result.posts).toHaveLength(count)
  expect(result.posts).toEqual(posts.slice((page - 1) * 10, page * 10))
})

test('排序与筛选后分页，置顶不跨页重复，原始目录不变', () => {
  const posts = Array.from({ length: 24 }, (_, index) => ({
    path: `/posts/${String(index).padStart(2, '0')}`,
    pin: index === 23 ? 1 : 0,
    publish: '2026-09-01',
    tags: index % 2 ? ['Vue'] : ['CSS'],
    categories: ['开发'],
  }))
  const filtered = filterPosts(sortPosts(posts), { kind: 'tag', name: 'Vue' })
  const first = paginatePosts(filtered, '1')
  const second = paginatePosts(filtered, '2')
  expect(first.total).toBe(12)
  expect(first.posts[0]?.path).toBe('/posts/23')
  expect(second.posts.map(post => post.path)).toEqual(['/posts/19', '/posts/21'])
  expect(new Set([...first.posts, ...second.posts].map(post => post.path)).size).toBe(12)
  expect(posts[0]?.path).toBe('/posts/00')
  expect(posts).toHaveLength(24)
})

test('少量页码完整展示，大量页码保留首尾与相邻页并折叠间隔', () => {
  expect(postPageNumbers(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7])
  expect(postPageNumbers(1, 20)).toEqual([1, 2, 'ellipsis', 20])
  expect(postPageNumbers(10, 20)).toEqual([1, 'ellipsis', 9, 10, 11, 'ellipsis', 20])
  expect(postPageNumbers(20, 20)).toEqual([1, 'ellipsis', 19, 20])
  expect(postPageNumbers(4, 8)).toEqual([1, 2, 3, 4, 5, 'ellipsis', 8])
})
