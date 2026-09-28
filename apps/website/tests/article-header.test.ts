import { DOMParser } from '@xmldom/xmldom'
import { expect, test } from 'vite-plus/test'
import { createSSRApp, defineComponent, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import AppIcon from '../app/components/AppIcon.vue'
import ArticleHeader from '../app/components/posts/ArticleHeader.vue'
import PostMeta from '../app/components/posts/PostMeta.vue'
import PostTags from '../app/components/posts/PostTags.vue'
import { postSchema } from '../shared/content/schema'
import { taxonomyPath } from '../shared/content/taxonomy'

const post = {
  ...postSchema.parse({ title: '文章标题', description: '文章摘要', publish: '2026-09-01', update: '2026-09-02', categories: ['开发', 'C#'], tags: ['Vue', 'C++'], wordCount: 401 }),
  path: '/posts/example',
}

async function render(patch: Partial<typeof post> = {}, preview = false) {
  const app = createSSRApp(ArticleHeader, { post: { ...post, ...patch }, preview })
  app.component('AppIcon', AppIcon)
  app.component('PostMeta', PostMeta)
  app.component('PostTags', PostTags)
  app.component('NuxtLink', defineComponent({ props: ['to'], setup: (props, { slots }) => () => h('a', { href: props.to }, slots.default?.()) }))
  app.component('ArticleViews', defineComponent({ setup: () => () => h('span', '浏览 5 次') }))
  app.component('ArticleNotices', defineComponent({ setup: () => () => null }))
  const html = await renderToString(app)
  return new DOMParser().parseFromString(html, 'text/html')
}

test('详情元信息位于标题之后，依次显示发布时间、更新时间、分类和标签', async () => {
  const document = await render()
  const text = document.documentElement.textContent!
  expect(text).not.toContain(post.description)
  const ordered = ['共401字', '3分钟', '浏览 5 次', '文章标题', '2026-09-01', '2026-09-02', '开发', 'C#', '#Vue', '#C++']
  for (let index = 1; index < ordered.length; index++)
    expect(text.indexOf(ordered[index]!)).toBeGreaterThan(text.indexOf(ordered[index - 1]!))
  const times = [...document.getElementsByTagName('time')]
  expect(times.map(time => time.getAttribute('datetime'))).toEqual([post.publish, post.update])
  expect(times.map(time => time.textContent?.trim())).toEqual([post.publish, post.update])
  expect(times.map(time => time.getAttribute('title'))).toEqual(['发布于 2026-09-01', '更新于 2026-09-02'])
  expect(times.map(time => time.getAttribute('aria-label'))).toEqual(['发布于 2026-09-01', '更新于 2026-09-02'])
  expect(times[0]!.parentNode).toBe(times[1]!.parentNode)
  expect([...document.getElementsByTagName('a')].map(link => link.getAttribute('href'))).toEqual([
    ...post.categories.map(category => taxonomyPath('category', category)),
    ...post.tags.map(tag => taxonomyPath('tag', tag)),
  ])
})

test('时间各有图标，多个分类和标签各只显示一个位于整组左侧的图标', async () => {
  const document = await render()
  const spans = [...document.getElementsByTagName('span')]
  for (const name of ['calendar-days', 'calendar-clock', 'folder-open', 'tags']) {
    const icons = spans.filter(span => span.getAttribute('class')?.split(' ').includes(`i-lucide-${name}`))
    expect(icons).toHaveLength(1)
    expect(icons[0]!.getAttribute('aria-hidden')).toBe('true')
  }
  for (const link of document.getElementsByTagName('a'))
    expect([...link.getElementsByTagName('span')].some(span => span.getAttribute('class')?.includes('i-lucide-'))).toBe(false)
  const categoryGroup = [...document.getElementsByTagName('div')].find(node => node.getAttribute('aria-label') === '文章分类')!
  expect(categoryGroup.firstChild?.firstChild?.toString()).toContain('i-lucide-folder-open')
  const tags = document.getElementsByTagName('ul')[0]!
  expect(tags.parentNode?.firstChild?.firstChild?.toString()).toContain('i-lucide-tags')
  expect(tags.parentNode?.parentNode).toBe(categoryGroup.parentNode)
})

test('没有更新日期、分类或标签时不显示对应图标和空分组', async () => {
  const document = await render({ update: undefined, categories: [], tags: [] })
  expect(document.getElementsByTagName('time')).toHaveLength(1)
  expect(document.getElementsByTagName('ul')).toHaveLength(0)
  const html = document.toString()
  for (const icon of ['calendar-clock', 'folder-open', 'tags'])
    expect(html).not.toContain(`i-lucide-${icon}`)
  expect(html).toContain('i-lucide-calendar-days')
})

test('后台预览保留相同元信息布局，隐藏浏览量', async () => {
  const document = await render({}, true)
  const text = document.documentElement.textContent!
  expect(text).not.toContain('浏览 5 次')
  expect(text).not.toContain(post.description)
  expect(text.indexOf(post.publish)).toBeGreaterThan(text.indexOf('文章标题'))
  expect(text).toContain('共401字')
  expect(text).toContain('#Vue')
})
