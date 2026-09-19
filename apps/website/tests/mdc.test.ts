import type { PageCollectionItemBase } from '@nuxt/content'
import { parseMarkdown } from '@nuxtjs/mdc/runtime'
import MDCRenderer from '@nuxtjs/mdc/runtime/components/MDCRenderer.vue'
import { expect, test, vi } from 'vite-plus/test'
import { createSSRApp, defineComponent, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import CodeGroup from '../app/components/content/CodeGroup.vue'
import ProseA from '../app/components/content/ProseA.vue'
import ProseImg from '../app/components/content/ProseImg.vue'
import ProsePre from '../app/components/content/ProsePre.vue'
import ArticleContent from '../app/components/posts/ArticleContent.vue'
import { createCodeCopy, nextCodeTab } from '../app/features/code/blocks'
import { canPreviewImage, createImagePreview, imagePreviewKey, imageSource } from '../app/features/images/context'
import { constrainTransform, fitImage, initialTransform, pinchImage, zoomImage } from '../app/features/images/geometry'
import { articleNotices, noticeOptionsSchema, shanghaiDay } from '../shared/content/notices'

const noticeOptions = { wip: true, staleAfterDays: 365 }
const post = { wip: true, publish: '2025-01-01' }

test('施工和时效提醒独立判断，满 365 天时展示', () => {
  expect(articleNotices(post, noticeOptions, '2025-12-31')).toMatchObject({ wip: true, stale: false })
  expect(articleNotices(post, noticeOptions, '2026-01-01')).toMatchObject({ wip: true, stale: true })
  expect(articleNotices({ ...post, update: '2025-12-01' }, noticeOptions, '2026-01-01').stale).toBe(false)
  expect(articleNotices(post, noticeOptions, '2024-01-01').stale).toBe(false)
  expect(articleNotices(post, { wip: false, staleAfterDays: null }, '2026-01-01')).toMatchObject({ wip: false, stale: false })
})

test('自然日按上海时区计算，拒绝非法提醒阈值', () => {
  expect(shanghaiDay(new Date('2026-01-01T15:59:59Z'))).toBe('2026-01-01')
  expect(shanghaiDay(new Date('2026-01-01T16:00:00Z'))).toBe('2026-01-02')
  for (const days of [0, -1, 1.5])
    expect(noticeOptionsSchema.safeParse({ wip: true, staleAfterDays: days }).success).toBe(false)
})

test('图片开关、链接和错误状态控制预览，关闭释放当前图片', () => {
  expect(canPreviewImage(true, false, false)).toBe(true)
  for (const [value, linked, failed] of [[false, false, false], ['false', false, false], [true, true, false], [true, false, true]] as const)
    expect(canPreviewImage(value, linked, failed)).toBe(false)
  const viewer = createImagePreview()
  viewer.open({ src: '/image.svg', alt: '示意图' })
  expect(viewer.image.value?.src).toBe('/image.svg')
  viewer.close()
  expect(viewer.image.value).toBeNull()
})

test('图片保留站点前缀和远程地址，适应窗口时不放大小图', () => {
  expect(imageSource('/image.svg', '/blog/')).toBe('/blog/image.svg')
  expect(imageSource('/blog/image.svg', '/blog/')).toBe('/blog/image.svg')
  expect(imageSource('https://example.com/image.svg', '/blog/')).toBe('https://example.com/image.svg')
  expect(fitImage({ width: 1200, height: 800 }, { width: 300, height: 300 })).toEqual({ width: 300, height: 200 })
  expect(fitImage({ width: 100, height: 50 }, { width: 300, height: 300 })).toEqual({ width: 100, height: 50 })
})

test('缩放保留指针下的图片位置，比例和平移不能越界', () => {
  const size = { width: 400, height: 300 }
  expect(zoomImage(initialTransform(), 2, { x: 50, y: 20 }, size, size)).toEqual({ scale: 2, x: -50, y: -20 })
  expect(constrainTransform({ scale: 8, x: 9999, y: -9999 }, size, size)).toEqual({ scale: 4, x: 600, y: -450 })
  expect(constrainTransform({ scale: 0.5, x: 100, y: 100 }, size, size)).toEqual(initialTransform())
})

test('标签方向键循环选择，Home 和 End 到达首尾', () => {
  expect(nextCodeTab('ArrowLeft', 0, 3)).toBe(2)
  expect(nextCodeTab('ArrowRight', 2, 3)).toBe(0)
  expect(nextCodeTab('Home', 2, 3)).toBe(0)
  expect(nextCodeTab('End', 0, 3)).toBe(2)
  expect(nextCodeTab('Tab', 1, 3)).toBe(1)
})

test('双指缩放跟随手势中心移动，重叠触点不产生无效比例', () => {
  const size = { width: 400, height: 300 }
  expect(pinchImage(initialTransform(), [{ x: -50, y: 0 }, { x: 50, y: 0 }], [{ x: -80, y: 30 }, { x: 120, y: 30 }], size, size)).toEqual({ scale: 2, x: 20, y: 30 })
  expect(pinchImage(initialTransform(), [{ x: 0, y: 0 }, { x: 0, y: 0 }], [{ x: 10, y: 0 }, { x: 20, y: 0 }], size, size)).toEqual(initialTransform())
})

test('复制保留原始换行缩进，失败不报告成功', async () => {
  const write = vi.fn().mockResolvedValue(undefined)
  const copy = createCodeCopy(write)
  await copy.copy('  const value = 1\n\n')
  expect(write).toHaveBeenCalledWith('  const value = 1\n\n')
  expect(copy.state.value).toBe('success')
  write.mockRejectedValue(new Error('拒绝访问'))
  await copy.copy('other')
  expect(copy.state.value).toBe('error')
})

test('切换代码后丢弃旧复制结果，多个复制实例互不影响', async () => {
  let finish!: () => void
  const first = createCodeCopy(() => new Promise<void>((resolve) => {
    finish = resolve
  }))
  const second = createCodeCopy(async () => {})
  const pending = first.copy('first')
  first.reset()
  await second.copy('second')
  finish()
  await pending
  expect(first.state.value).toBe('idle')
  expect(second.state.value).toBe('success')
})

async function renderMarkdown(source: string) {
  const { body, data } = await parseMarkdown(source, { highlight: false })
  const app = createSSRApp({ render: () => h(MDCRenderer, {
    body,
    data,
    components: { 'pre': ProsePre, 'img': ProseImg, 'a': ProseA, 'code-group': CodeGroup },
  }) })
  app.provide(imagePreviewKey, createImagePreview())
  app.component('NuxtLink', defineComponent({
    props: { href: String, target: String },
    setup: (props, { slots }) => () => h('a', props, slots.default?.()),
  }))
  return renderToString(app)
}

test('真实 MDC 代码组首屏选中第一项，保留代码、行强调和独立面板标识', async () => {
  const group = '::code-group\n\n```ts [first.ts]{2}\nconst first = 1\nconst second = 2\n```\n\n```bash [检查]\nvp run check\n```\n\n::'
  const html = await renderMarkdown(`${group}\n\n${group}`)
  expect(html.match(/role="tablist"/g)).toHaveLength(2)
  expect(html.match(/aria-selected="true"/g)).toHaveLength(2)
  expect(html.match(/role="tabpanel"[^>]*hidden/g)).toHaveLength(2)
  const panelIds = [...html.matchAll(/id="([^"]+-panel-\d+)"/g)].map(match => match[1])
  expect(new Set(panelIds).size).toBe(4)
  expect(html).toContain('first.ts')
  expect(html).toContain('const second = 2')
  expect(html).toContain('.line[line="2"]')
  expect(html.match(/aria-label="复制代码"/g)).toHaveLength(2)
})

test('单项代码组与普通代码都能显示，意外内容不会丢失', async () => {
  const html = await renderMarkdown('::code-group\n\n```text [说明]\n一段代码\n```\n\n::\n\n::code-group\n\n保留这段说明\n\n```text\n代码\n```\n\n::')
  expect(html).not.toContain('role="tablist"')
  expect(html).toContain('一段代码')
  expect(html).toContain('保留这段说明')
})

test('真实 Markdown 图片保留图注和尺寸，链接及显式关闭的图片没有嵌套按钮', async () => {
  const html = await renderMarkdown('![示意图](/images/content-example.svg){width="1200" height="675" caption="图注"}\n\n![静态图片](/image.svg){:preview="false"}\n\n[![链接图片](/linked.svg)](/about)')
  expect(html.match(/aria-haspopup="dialog"/g)).toHaveLength(1)
  expect(html).toContain('width="1200" height="675"')
  expect(html).toContain('图注')
  const linkedImage = html.match(/<a\s[^>]*href="\/about"[^>]*>([\s\S]*?)<\/a>/)?.[1]
  expect(linkedImage).toContain('链接图片')
  expect(linkedImage).not.toContain('<button')
})

test('关于页传入的布局属性只应用于正文，不落入图片浮层', async () => {
  const value = { id: 'about/about.md' } as PageCollectionItemBase
  const app = createSSRApp({ render: () => h(ArticleContent, { value, 'class': 'mb-8', 'data-article': 'about' }) })
  app.component('ContentRenderer', defineComponent({ props: ['value'], render: () => h('div', '正文') }))
  app.component('ImagePreview', defineComponent({ props: ['image'], render: () => h('aside', { 'data-preview': '' }) }))
  const html = await renderToString(app)
  expect(html).toMatch(/<div[^>]*class="mb-8 /)
  expect(html).toContain('data-article="about"')
  expect(html).toContain('<aside data-preview></aside>')
})
