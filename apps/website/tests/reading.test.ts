import { afterEach, expect, test, vi } from 'vite-plus/test'
import { computed, createSSRApp, defineComponent, h, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'
import AppIcon from '../app/components/AppIcon.vue'
import ArticleHeader from '../app/components/posts/ArticleHeader.vue'
import PostCard from '../app/components/posts/PostCard.vue'
import PostListItem from '../app/components/posts/PostListItem.vue'
import PostMeta from '../app/components/posts/PostMeta.vue'
import { usePostCatalog } from '../app/composables/usePostCatalog'
import { markdownWordCount } from '../content/reading'
import { readingMinutes } from '../shared/content/reading'
import { postSchema } from '../shared/content/schema'

afterEach(() => vi.unstubAllGlobals())

test.each([
  ['', 0],
  [' \n\t，。！？…—— 😀', 0],
  ['中文English混排 123 Vue3 hello-world don\'t', 10],
  ['# 标题\n\n正文。', 4],
  ['> 引用\n\n- 列表\n- English words', 6],
  ['| Name | 中文 |\n| --- | --- |\n| Vue | 内容 |', 6],
  ['**hello** *world* ~~deleted~~ `inlineCode 123 中文`', 7],
  ['hel**lo** [world](https://example.com)\n\nnext\n\nword', 4],
  ['[链接](https://example.com "不计标题") ![图片说明](/images/不计路径.png)\n\n[引用][ref]\n\n[ref]: https://example.com', 4],
  ['```ts [不计文件名]\nconst code = "不计代码"\n```\n\n    缩进代码 excluded\n\n正文', 2],
  ['::callout{title="不计属性"}\n组件正文\n\n#title\n插槽内容\n::\n\n:badge[标签]{color="red"}', 10],
  ['<div title="不计属性">HTML 文本</div>\n\n<!-- 不计注释 -->\n\n<script>hidden words</script>\n\n<style>hidden words</style>', 3],
  ['𠮷 café e\u0301 2026', 4],
])('正文计数：%j → %i', async (body, expected) => {
  expect(await markdownWordCount(body)).toBe(expected)
})

test('文章元数据、摘要和手写统计不计入正文', async () => {
  const source = '---\ntitle: 不计标题\ndescription: 不计摘要\nwordCount: 99999\n---\n正文 Vue'
  expect(await markdownWordCount(source)).toBe(3)
})

test.each([[0, 0], [1, 1], [199, 1], [200, 1], [201, 2], [400, 2], [401, 3]])('阅读时长：%i 字 → %i 分钟', (words, minutes) => {
  expect(readingMinutes(words)).toBe(minutes)
})

const post = { ...postSchema.parse({ title: '测试文章', description: '测试摘要', publish: '2026-09-01', update: '2026-09-02', categories: ['开发'], wordCount: 401 }), path: '/posts/example' }

test.each([PostListItem, PostCard, ArticleHeader])('首次 SSR 仅在文章详情显示字数和时长，列表及卡片不显示', async (component) => {
  const app = createSSRApp(component, { post })
  const empty = defineComponent({ setup: () => () => null })
  app.component('AppIcon', AppIcon)
  app.component('PostMeta', PostMeta)
  app.component('NuxtLink', defineComponent({ props: ['to'], setup: (props, { slots }) => () => h('a', { href: props.to }, slots.default?.()) }))
  app.component('ArticleViews', defineComponent({ setup: () => () => h('span', '浏览 5 次') }))
  app.component('PostTags', empty)
  app.component('ArticleNotices', empty)
  const html = await renderToString(app)
  const text = html.replace(/<[^>]*>/g, '')
  if (component !== ArticleHeader) {
    expect(text).not.toContain('共401字')
    expect(text).not.toContain('3分钟')
    expect(html).not.toContain('i-lucide-file-text')
    expect(html).not.toContain('i-lucide-clock')
    expect(text).toContain('发布于')
    expect(text).toContain('开发')
    return
  }
  expect(text).toContain('共401字')
  expect(text).toContain('3分钟')
  expect(html).toContain('i-lucide-file-text')
  expect(html).toContain('i-lucide-clock')
  expect(text.indexOf(post.publish)).toBeGreaterThan(text.indexOf(post.title))
  expect(text.indexOf('3分钟')).toBeGreaterThan(text.indexOf('共401字'))
  expect(text.indexOf('开发')).toBeGreaterThan(text.indexOf('3分钟'))
  expect(text.indexOf(post.update!)).toBeGreaterThan(text.indexOf(post.publish))
  expect(text.indexOf('浏览 5 次')).toBeGreaterThan(text.indexOf('3分钟'))
})

test('列表查询携带已计算字数，不加载正文', async () => {
  const select = vi.fn((...fields: string[]) => ({
    all: async () => [Object.fromEntries(fields.map(field => [field, post[field as keyof typeof post]]))],
  }))
  vi.stubGlobal('queryCollection', () => ({ select }))
  vi.stubGlobal('computed', computed)
  vi.stubGlobal('useAsyncData', (_key: string, handler: () => Promise<unknown>) => handler().then(data => ({ data: ref(data) })))
  const catalog = await usePostCatalog().ready
  expect(select.mock.calls[0]).toContain('wordCount')
  expect(select.mock.calls[0]).not.toContain('body')
  expect(catalog.data.value?.[0]).toMatchObject({ path: post.path, wordCount: 401 })
})
