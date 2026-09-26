import { readFile } from 'node:fs/promises'
import { expect, test } from 'vite-plus/test'
import { visibleCategoryCount } from '../app/features/categories/overflow.ts'
import { readFrontmatter, validateFrontmatter } from '../content/validation.ts'
import { articleRoute } from '../shared/admin/model.ts'
import { archiveYears } from '../shared/content/browse.ts'
import {
  aggregateTerms,
  filterPosts,
  formatPostDate,
  sortPosts,
} from '../shared/content/catalog.ts'
import { postSchema } from '../shared/content/schema.ts'

const meta = { title: '测试文章', description: '测试描述', publish: '2024-02-29' }
test.each(['about', 'use'] as const)('静态页 %s 校验标题和简介，不要求文章发布日期', (kind) => {
  const source = ['---', 'title: Use', 'description: 我的装备', '---', '## Development'].join('\n')
  expect(validateFrontmatter(source, `${kind}.md`, kind)).toEqual({ title: 'Use', description: '我的装备' })
  expect(() => validateFrontmatter(source.replace('title: Use\n', ''), `${kind}.md`, kind)).toThrow(new RegExp(`${kind}.md.*title`))
  expect(() => validateFrontmatter(source.replace('description: 我的装备', 'description: ""'), `${kind}.md`, kind)).toThrow(new RegExp(`${kind}.md.*description`))
  expect(() => validateFrontmatter(source.replace('title: Use', 'title: Use\npath: /other'), `${kind}.md`, kind)).toThrow(/不能通过 frontmatter 覆盖/)
})

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
test('按置顶权重、发布日期倒序和路径升序排序，更新日期不参与且不修改输入', () => {
  const posts = [
    { path: '/posts/b', pin: 0, publish: '2026-09-13', update: '2026-09-30' },
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

test('Markdown 示例按发布先后倒序展示：Markdown 最早，MDC 其次，扩展功能再后', async () => {
  const filenames = ['01.markdown.md', '02.mdc-tutorial.md', '03.markdown-extended.md', '04.video.md', '05.collapse.md']
  const posts = await Promise.all(filenames.map(async (filename) => {
    const source = await readFile(new URL(`../../../content/posts/1.markdown/${filename}`, import.meta.url), 'utf8')
    return {
      ...postSchema.parse(readFrontmatter(source, filename)),
      stem: `posts/1.markdown/${filename.slice(0, -3)}`,
      path: articleRoute(`1.markdown/${filename}`),
    }
  }))
  const newestFirst = ['在正文中使用折叠内容', '在文章中嵌入视频', 'Markdown 扩展功能', 'MDC 教程', 'Markdown 教程']
  expect(sortPosts(posts).map(post => post.title)).toEqual(newestFirst)
  expect(archiveYears(posts).flatMap(group => group.articles.map(post => post.title))).toEqual(newestFirst)
})

test('同日按文件名序号数值倒序，有序号优先，目录编号不参与排序', () => {
  const posts = [
    { path: '/posts/a-plain', stem: '0.folder/plain' },
    { path: '/posts/b-missing' },
    { path: '/posts/ten', stem: '0.folder/10.ten' },
    { path: '/posts/two', stem: '1.folder/02.two' },
    { path: '/posts/one', stem: '99.folder/1.one' },
  ].map(post => ({ ...post, publish: '2026-09-25', pin: 0 }))
  const before = structuredClone(posts)
  expect(sortPosts(posts).map(post => post.path)).toEqual([
    '/posts/ten',
    '/posts/two',
    '/posts/one',
    '/posts/a-plain',
    '/posts/b-missing',
  ])
  expect(posts).toEqual(before)
})

test('发布日期优先于序号，序号相同时按规范化网址升序', () => {
  const posts = [
    { path: '/posts/z/same', stem: '1.z/2.same', publish: '2026-09-25' },
    { path: '/posts/old', stem: '0.old', publish: '2026-09-24' },
    { path: '/posts/a/same', stem: '9.a/02.same', publish: '2026-09-25' },
    { path: '/posts/new', publish: '2026-09-26' },
  ].map(post => ({ ...post, pin: 0 }))
  expect(sortPosts(posts).map(post => post.path)).toEqual([
    '/posts/new',
    '/posts/a/same',
    '/posts/z/same',
    '/posts/old',
  ])
})
test('归档按发布日期和序号分组，置顶和更新日期不改变归档顺序', () => {
  const posts = [
    { path: '/posts/a', stem: '0.folder/10.a', publish: '2026-09-25', pin: 9 },
    { path: '/posts/b', stem: '99.folder/02.b', publish: '2026-09-25', pin: 0 },
    { path: '/posts/new', publish: '2026-09-26', pin: 0 },
    { path: '/posts/old', publish: '2025-01-01', update: '2026-09-27', pin: 99 },
  ]
  const before = structuredClone(posts)
  expect(archiveYears(posts).map(group => [group.year, group.articles.map(post => post.path)])).toEqual([
    ['2026', ['/posts/new', '/posts/a', '/posts/b']],
    ['2025', ['/posts/old']],
  ])
  expect(posts).toEqual(before)
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
