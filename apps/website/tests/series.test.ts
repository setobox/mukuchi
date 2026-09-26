import { expect, test } from 'vite-plus/test'
import { validateFrontmatter } from '../shared/content/document'
import { postSchema } from '../shared/content/schema'
import { collectSeries } from '../shared/content/series'

const meta = { title: '文章', description: '', publish: '2026-09-26' }

test('旧文章没有系列；系列名称规范空白，单篇系列和 0 序号有效', () => {
  const old = postSchema.parse(meta)
  expect(old.series).toBeUndefined()
  expect(old.seriesOrder).toBeUndefined()
  expect(collectSeries([{ ...old, path: '/posts/old' }])).toEqual([])
  const post = { ...postSchema.parse({ ...meta, series: ' C# / Vue：100% ', seriesOrder: 0 }), path: '/posts/start' }
  expect(collectSeries([post])).toEqual([{ name: 'C# / Vue：100%', posts: [post] }])
})

test.each([
  { series: '' },
  { series: '  ' },
  { series: ['甲', '乙'] },
  { series: '坏\n名称' },
  { series: '\uD800' },
  { seriesOrder: 0 },
  { series: '甲', seriesOrder: -1 },
  { series: '甲', seriesOrder: 0.5 },
  { series: '甲', seriesOrder: '1' },
  { series: '甲', seriesOrder: Number.POSITIVE_INFINITY },
])('拒绝无效系列或序号：%j', (patch) => {
  expect(postSchema.safeParse({ ...meta, ...patch }).success).toBe(false)
})

test('内容导入错误包含文件名和系列字段', () => {
  const source = '---\ntitle: 测试\ndescription: ""\npublish: "2026-09-26"\nseries: 示例\nseriesOrder: -1\n---\n正文'
  expect(() => validateFrontmatter(source, 'guide/intro.md', 'posts')).toThrow(/intro.md.*seriesOrder/)
  expect(validateFrontmatter(source.replace('seriesOrder: -1', 'seriesOrder: 0'), 'guide/intro.md', 'posts')).toMatchObject({ series: '示例', seriesOrder: 0 })
})

test('系列按序号、日期倒序、路径排序；未编号排后，置顶和文件名前缀不参与', () => {
  const posts = [
    { title: '未编号旧', path: '/posts/unset-old', publish: '2020-01-01' },
    { title: '未编号新', path: '/posts/unset-new', publish: '2026-09-26' },
    { title: '第十', path: '/posts/ten', publish: '2026-09-26', seriesOrder: 10 },
    { title: '同序旧', path: '/posts/two-old', publish: '2020-01-01', seriesOrder: 2 },
    { title: '同日乙', path: '/posts/b', publish: '2026-09-26', seriesOrder: 2, stem: '1.b', pin: 100 },
    { title: '同日甲', path: '/posts/a', publish: '2026-09-26', seriesOrder: 2, stem: '99.a' },
    { title: '开篇', path: '/posts/zero', publish: '2020-01-01', seriesOrder: 0 },
  ].map(post => ({ ...post, series: '甲' }))
  const before = structuredClone(posts)
  expect(collectSeries(posts)[0]!.posts.map(post => post.path)).toEqual(['/posts/zero', '/posts/a', '/posts/b', '/posts/two-old', '/posts/ten', '/posts/unset-new', '/posts/unset-old'])
  expect(posts).toEqual(before)
})

test('系列名称稳定排序，同名归组，每篇只属于一个系列，不归类无系列文章', () => {
  const post = { ...meta, path: '/posts/a' }
  const groups = collectSeries([{ ...post, series: 'B' }, { ...post, path: '/posts/b', series: 'A' }, { ...post, path: '/posts/c', series: ' B ' }, post])
  expect(groups.map(group => [group.name, group.posts.length])).toEqual([['A', 1], ['B', 2]])
})
