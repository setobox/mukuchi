import { expect, test } from 'vite-plus/test'
import { visibleCategoryCount } from '../app/features/categories/overflow.ts'
import { validateFrontmatter } from '../content/validation.ts'
import {
  aggregateTerms,
  filterPosts,
  formatPostDate,
  sortPosts,
} from '../shared/content/catalog.ts'
import { postSchema } from '../shared/content/schema.ts'

const meta = { title: '测试文章', description: '测试描述', publish: '2024-02-29' }
test.each(['', '   '])('文章允许空简介，并将空白简介规范为空字符串：%j', (description) => {
  const source = ['---', 'title: React', `description: '${description}'`, 'publish: \'2024-02-29\'', '---', '# 正文'].join('\n')
  expect(validateFrontmatter(source, 'drafts/react.md', 'posts')).toMatchObject({ title: 'React', description: '' })
})

test('文章填充默认值，并规范标签和专栏', () => {
  expect(
    postSchema.parse({ ...meta, tags: [' Vue ', 'Vue'], categories: ['前端', '前端'] }),
  ).toMatchObject({
    tags: ['Vue'],
    categories: ['前端'],
    pin: 0,
    wip: false,
    theme: '#a369ff',
  })
})
test('拒绝不存在的日期、倒序更新日期和无效元数据', () => {
  for (const patch of [
    { publish: '2023-02-29' },
    { publish: '2024-13-01' },
    { publish: '2024-04-31' },
    { publish: '2024-2-29' },
    { update: '2024-02-28' },
    { title: ' ' },
    { pin: -1 },
    { pin: 0.5 },
    { tags: [' '] },
    { theme: '#ffffff' },
    { cover: 'javascript:alert(1)' },
  ])
    expect(postSchema.safeParse({ ...meta, ...patch }).success).toBe(false)
})
test('原始 frontmatter 缺少标题时不使用正文标题替代，错误包含文件名和字段', () => {
  const source = ['---', 'description: 测试', 'publish: \'2024-02-29\'', '---', '# 正文标题'].join(
    '\n',
  )
  expect(() => validateFrontmatter(source, 'content/posts/invalid.md', 'posts')).toThrow(
    /invalid.md.*title/,
  )
  expect(() => validateFrontmatter('# 无元数据', 'empty.md', 'posts')).toThrow(
    /empty.md.*frontmatter/,
  )
})
test('按置顶权重、发布日期倒序和路径升序排序，不修改输入', () => {
  const posts = [
    { path: '/posts/b', pin: 0, publish: '2026-09-13' },
    { path: '/posts/a', pin: 0, publish: '2026-09-13' },
    { path: '/posts/new', pin: 0, publish: '2026-09-14' },
    { path: '/posts/pinned', pin: 2, publish: '2020-01-01' },
  ]
  expect(sortPosts(posts).map(post => post.path)).toEqual([
    '/posts/pinned',
    '/posts/new',
    '/posts/a',
    '/posts/b',
  ])
  expect(posts[0]?.path).toBe('/posts/b')
})
test('多专栏聚合不重复计数，专栏与标签各自筛选', () => {
  const posts = [
    {
      ...postSchema.parse({ ...meta, tags: ['Vue'], categories: ['前端', '教程', '教程'] }),
      path: '/posts/a',
    },
    {
      ...postSchema.parse({ ...meta, tags: ['Markdown'], categories: ['教程'] }),
      path: '/posts/b',
    },
  ]
  expect(aggregateTerms(posts, 'categories')).toEqual([
    { name: '前端', count: 1 },
    { name: '教程', count: 2 },
  ])
  expect(filterPosts(posts, { kind: 'category', name: '教程' })).toEqual(posts)
  expect(filterPosts(posts, { kind: 'tag', name: 'Vue' })).toEqual([posts[0]])
  expect(filterPosts(posts, { kind: 'tag', name: '不存在' })).toEqual([])
  expect(filterPosts(posts)).toEqual(posts)
})
test('按上海日期展示', () => {
  expect(formatPostDate('2024-02-29')).toBe('2024-02-29')
})
test('分类导航按实际宽度预留更多按钮，临界宽度不溢出', () => {
  expect(visibleCategoryCount([100, 100], 360, 140, 80)).toBe(2)
  expect(visibleCategoryCount([100, 100], 350, 140, 80)).toBe(1)
  expect(visibleCategoryCount([100, 100], 335, 140, 80)).toBe(0)
  expect(visibleCategoryCount([], 335, 140, 80)).toBe(0)
})
test('分类导航使用传入的 8px 间距，并在全部可见时释放更多按钮的空间', () => {
  expect(visibleCategoryCount([108, 120], 344, 100, 76, 8)).toBe(2)
  expect(visibleCategoryCount([108, 120], 343, 100, 76, 8)).toBe(1)
  expect(visibleCategoryCount([108, 120], 300, 100, 76, 8)).toBe(1)
  expect(visibleCategoryCount([108, 120], 299, 100, 76, 8)).toBe(0)
})
test('分类导航处理空分类、窄容器和长名称，保留原有分类顺序', () => {
  expect(visibleCategoryCount([], 100, 100, 76, 8)).toBe(0)
  expect(visibleCategoryCount([108], 184, 100, 76, 8)).toBe(0)
  expect(visibleCategoryCount([400, 80], 350, 100, 76, 8)).toBe(0)
  expect(visibleCategoryCount([100.5, 132.25], 348.75, 100, 76, 8)).toBe(2)
  expect(visibleCategoryCount([100.5, 132.25], 348.5, 100, 76, 8)).toBe(1)
})
