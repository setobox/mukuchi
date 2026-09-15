import type { Component } from 'vue'
import type { NuxtApp } from '#app'
import type { TaxonomyFilter } from '../shared/content/taxonomy'
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { computed, createSSRApp, defineComponent, h, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'
import PostCollection from '../app/components/posts/PostCollection.vue'
import PostMeta from '../app/components/posts/PostMeta.vue'
import PostTags from '../app/components/posts/PostTags.vue'
import TagFilter from '../app/components/posts/TagFilter.vue'
import { usePageContext } from '../app/composables/usePageContext'
import { useTaxonomyPage } from '../app/composables/useTaxonomyPage'
import { validateFrontmatter } from '../content/validation'
import { aggregateTerms } from '../shared/content/catalog'
import { postSchema } from '../shared/content/schema'
import { isTaxonomyName, taxonomyPath, taxonomyTitle } from '../shared/content/taxonomy'

const posts = [
  { ...postSchema.parse({ title: '文章一', description: '说明', publish: '2026-09-01', tags: ['Vue', 'C#'], categories: ['内容管理'] }), path: '/posts/first' },
  { ...postSchema.parse({ title: '文章二', description: '说明', publish: '2026-09-02', tags: ['Vue', 'C++'], categories: ['开发'] }), path: '/posts/second' },
]

afterEach(() => vi.unstubAllGlobals())

function catalogState() {
  return {
    data: ref(posts),
    tags: ref(aggregateTerms(posts, 'tags')),
    categories: ref(aggregateTerms(posts, 'categories')),
    error: ref<unknown>(),
    status: ref('success'),
    ready: Promise.resolve(),
    refresh: vi.fn(),
  }
}

const NuxtLink = defineComponent({
  props: ['to'],
  setup: (props, { slots }) => () => h('a', { href: props.to }, slots.default?.()),
})
const Container = defineComponent({ setup: (_, { slots }) => () => h('div', slots.default?.()) })
const Item = defineComponent({
  props: ['post'],
  setup: props => () => h('article', props.post.title),
})

async function render(component: Component, props: Record<string, unknown>) {
  const app = createSSRApp(component, props)
  for (const [name, child] of Object.entries({
    NuxtLink,
    AppIcon: Container,
    SiteColumns: Container,
    SiteSidebar: Container,
    TagFilter,
    PostListItem: Item,
    PostCard: Item,
    BaseButton: Container,
    ContentEmptyState: Container,
  })) app.component(name, child)
  return renderToString(app)
}

test('专栏与标签按单个路径段编码，中文、空格及符号保持原名', () => {
  for (const name of ['内容管理', 'Vue Router', 'C++', 'C#', '100%', '%23', 'a?b', 'Vue', 'vue']) {
    for (const kind of ['category', 'tag'] as const) {
      const path = taxonomyPath(kind, name)
      expect(path).toBe(`/${kind === 'category' ? 'categories' : 'tags'}/${encodeURIComponent(name)}`)
      expect(decodeURIComponent(path.split('/')[2]!)).toBe(name)
      expect(new URL(path, 'https://example.com').search).toBe('')
      expect(new URL(path, 'https://example.com').hash).toBe('')
    }
  }
})

test('非法名称在内容边界拒绝，错误包含文件及具体字段', () => {
  for (const name of ['', ' ', '.', '..', ' . ', 'a/b', 'a\\b', 'a\u0000b', '\nVue', 'Vue\t', 'a\u007Fb', 'a\u0085b', '\uD800']) {
    expect(isTaxonomyName(name)).toBe(false)
    expect(() => taxonomyPath('tag', name)).toThrow()
    for (const field of ['tags', 'categories']) {
      const source = `---\ntitle: 示例\ndescription: 说明\npublish: '2026-09-01'\n${field}: [${JSON.stringify(name)}]\n---\n正文`
      expect(() => validateFrontmatter(source, 'example.md', 'posts')).toThrow(new RegExp(`example\\.md.*${field}\\.0`))
    }
  }
})

test('目录加载完成后才判断名称，忽略旧查询参数并且不重复解码', async () => {
  let finish!: () => void
  const catalog = catalogState()
  catalog.ready = new Promise<void>((resolve) => {
    finish = resolve
  })
  catalog.tags.value = []
  vi.stubGlobal('useRoute', () => ({ params: { name: '%23' }, query: { tag: 'Vue', category: '内容管理' } }))
  vi.stubGlobal('usePostCatalog', () => catalog)
  vi.stubGlobal('createError', (error: object) => error)
  const settled = vi.fn()
  const result = useTaxonomyPage('tag').then((value) => {
    settled()
    return value
  })
  await Promise.resolve()
  expect(settled).not.toHaveBeenCalled()
  catalog.tags.value = [{ name: '%23', count: 1 }]
  finish()
  expect((await result).filter).toEqual({ kind: 'tag', name: '%23' })
})

test('未知专栏与标签返回 404，内容查询失败优先返回 500', async () => {
  const catalog = catalogState()
  vi.stubGlobal('usePostCatalog', () => catalog)
  vi.stubGlobal('createError', (error: object) => error)
  for (const name of ['不存在', 'vue', undefined, ['Vue'], 'a/b']) {
    vi.stubGlobal('useRoute', () => ({ params: { name } }))
    for (const kind of ['category', 'tag'] as const)
      await expect(useTaxonomyPage(kind)).rejects.toMatchObject({ statusCode: 404 })
  }
  catalog.error.value = new Error('数据库不可用')
  await expect(useTaxonomyPage('tag')).rejects.toMatchObject({ statusCode: 500, message: '文章加载失败' })
})

test('标签入口始终进入全站标签路径，全部标签回到文章列表', async () => {
  const html = await render(TagFilter, { tags: [{ name: 'C#', count: 1 }], selected: 'C#' })
  expect(html).toContain('href="/posts"')
  expect(html).toContain('href="/tags/C%23"')
  expect(html).toContain('aria-current="true"')
  const tags = await render(PostTags, { tags: ['C++'] })
  expect(tags).toContain('href="/tags/C%2B%2B"')
  const meta = await render(PostMeta, { post: posts[0] })
  expect(meta).toContain(`href="${taxonomyPath('category', '内容管理')}"`)
})

test('文章集合仅使用显式筛选条件，旧查询参数不影响默认与独立筛选结果', async () => {
  vi.stubGlobal('computed', computed)
  vi.stubGlobal('usePostCatalog', catalogState)
  vi.stubGlobal('useCookie', () => ref('list'))
  vi.stubGlobal('useRoute', () => ({ path: '/posts', query: { tag: 'C++', category: '开发' } }))
  const all = await render(PostCollection, {})
  expect(all).toContain('文章一')
  expect(all).toContain('文章二')
  const category: TaxonomyFilter = { kind: 'category', name: '内容管理' }
  const selected = await render(PostCollection, { filter: category })
  expect(selected).toContain('文章一')
  expect(selected).not.toContain('文章二')
  const tag: TaxonomyFilter = { kind: 'tag', name: 'Vue' }
  const tagged = await render(PostCollection, { filter: tag })
  expect(tagged).toContain('文章一')
  expect(tagged).toContain('文章二')
})

test('动态标题与导航上下文随路径变化，标签仍属于文章导航', () => {
  const route = ref({ path: '/tags/C%23', params: { name: 'C#' }, meta: {
    section: 'posts',
    pageKind: 'index',
    parentPath: '/posts',
    pageTitle: (current: { params: { name: string } }) => taxonomyTitle('tag', current.params.name),
  } })
  vi.stubGlobal('computed', computed)
  vi.stubGlobal('useRoute', () => route.value)
  vi.stubGlobal('useState', () => ref(null))
  const page = usePageContext()
  expect(page.value).toMatchObject({ title: '标签：C#', section: 'posts', parentPath: '/posts' })
  route.value.params.name = 'Vue'
  route.value.path = '/tags/Vue'
  expect(page.value.title).toBe('标签：Vue')
})

test('服务端保留原始专栏和标签请求路径，百分号不重复编码且井号不变成锚点', async () => {
  vi.stubGlobal('defineNuxtPlugin', (plugin: { setup: (app: NuxtApp) => unknown }) => plugin.setup)
  const { default: plugin } = await import('../app/plugins/taxonomy-request-url.server')
  for (const path of ['/tags/%2523', '/tags/100%25', '/tags/C%23', '/categories/%E5%86%85%E5%AE%B9?tag=Vue']) {
    const app = {
      ssrContext: { url: '/wrongly-encoded', event: { node: { req: { url: path } } }, error: false },
      payload: { path: '/wrongly-encoded' },
    }
    await plugin(app as unknown as NuxtApp)
    expect(app.ssrContext.url).toBe(path)
    expect(app.payload.path).toBe(path)
  }
  for (const path of ['/posts/example', '/categories?tag=Vue', '/tags/a/b']) {
    const app = {
      ssrContext: { url: '/unchanged', event: { node: { req: { url: path } } }, error: false },
      payload: { path: '/unchanged' },
    }
    await plugin(app as unknown as NuxtApp)
    expect(app.ssrContext.url).toBe('/unchanged')
  }
})
