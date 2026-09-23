import { parseMarkdown } from '@nuxtjs/mdc/runtime'
import MDCRenderer from '@nuxtjs/mdc/runtime/components/MDCRenderer.vue'
import { expect, test } from 'vite-plus/test'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import Bilibili from '../app/components/content/Bilibili.vue'
import Youtube from '../app/components/content/Youtube.vue'
import { resolveVideo } from '../shared/video/embed'

const bvid = 'BV1fK4y1s7Qf'
const youtubeId = '5gIf0_xpFPI'

test('视频 ID 生成固定平台的播放器，默认关闭自动播放', () => {
  expect(resolveVideo('bilibili', { id: bvid })).toEqual({
    provider: 'bilibili',
    id: bvid,
    src: `https://player.bilibili.com/player.html?bvid=${bvid}&p=1&autoplay=0`,
    href: `https://www.bilibili.com/video/${bvid}/`,
  })
  expect(resolveVideo('youtube', { id: youtubeId })).toEqual({
    provider: 'youtube',
    id: youtubeId,
    src: `https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=0&playsinline=1`,
    href: `https://www.youtube.com/watch?v=${youtubeId}`,
  })
})

test('Bilibili 链接保留分 P 和开始时间，显式参数优先，丢弃其他查询参数', () => {
  const video = resolveVideo('bilibili', { src: `https://www.bilibili.com/video/${bvid}/?p=2&t=30&autoplay=1&share_source=copy_web` })!
  expect(video.src).toBe(`https://player.bilibili.com/player.html?bvid=${bvid}&p=2&autoplay=0&t=30`)
  expect(video.href).toBe(`https://www.bilibili.com/video/${bvid}/?p=2&t=30`)
  const override = resolveVideo('bilibili', { src: video.src, p: '3', start: 0 })!
  expect(override.src).toBe(`https://player.bilibili.com/player.html?bvid=${bvid}&p=3&autoplay=0`)
  expect(override.href).toBe(`https://www.bilibili.com/video/${bvid}/?p=3`)
})

test.each([
  `https://www.youtube.com/watch?v=${youtubeId}&t=1m30s`,
  `https://youtu.be/${youtubeId}?t=90&si=tracking`,
  `https://m.youtube.com/shorts/${youtubeId}?t=90`,
  `https://www.youtube.com/live/${youtubeId}?t=90`,
  `https://www.youtube.com/embed/${youtubeId}?start=90&autoplay=1`,
  `https://www.youtube-nocookie.com/embed/${youtubeId}?start=90`,
])('YouTube 常见链接规范化为同一个播放器：%s', (src) => {
  const video = resolveVideo('youtube', { src })!
  expect(video.src).toBe(`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=0&playsinline=1&start=90`)
  expect(video.href).toBe(`https://www.youtube.com/watch?v=${youtubeId}&t=90s`)
})

test('显式 ID 优先，起始时间接受秒数和时分秒格式', () => {
  expect(resolveVideo('youtube', { id: youtubeId, src: 'https://invalid.example', start: '1h2m3s' })?.src).toContain('start=3723')
  expect(resolveVideo('youtube', { id: ` ${youtubeId} `, start: '0' })?.src).not.toContain('start=')
  expect(resolveVideo('bilibili', { id: bvid, p: 2, start: 10 })?.src).toContain('p=2&autoplay=0&t=10')
})

test('拒绝伪装域名、非视频链接、错误平台和可注入的 ID', () => {
  for (const provider of ['bilibili', 'youtube'] as const) {
    for (const input of [{}, { id: '' }, { id: 123 }, { id: 'abc?autoplay=1' }, { id: '<script>' }, { src: 'javascript:alert(1)' }, { src: '//www.youtube.com/watch?v=5gIf0_xpFPI' }])
      expect(resolveVideo(provider, input)).toBeNull()
  }
  for (const src of [
    `https://www.youtube.com.evil.example/watch?v=${youtubeId}`,
    `https://www.youtube.com@evil.example/watch?v=${youtubeId}`,
    `https://user:pass@www.youtube.com/watch?v=${youtubeId}`,
    `https://www.youtube.com:8443/watch?v=${youtubeId}`,
    `https://www.youtube.com/playlist?v=${youtubeId}`,
    `https://www.youtube.com/embed/${youtubeId}/extra`,
    `https://www.bilibili.com/video/${bvid}`,
  ]) expect(resolveVideo('youtube', { src })).toBeNull()
  for (const src of [
    `https://evil.bilibili.com/video/${bvid}`,
    `https://www.bilibili.com/video/${bvid}/extra`,
    'https://b23.tv/example',
    `https://www.youtube.com/watch?v=${youtubeId}`,
  ]) expect(resolveVideo('bilibili', { src })).toBeNull()
  expect(resolveVideo('bilibili', { id: 'bv1fK4y1s7Qf' })).toBeNull()
})

test('无效分 P 和起始时间展示错误，不生成播放器', () => {
  for (const p of [0, -1, 1.5, '', '2x', true, {}, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])
    expect(resolveVideo('bilibili', { id: bvid, p })).toBeNull()
  for (const start of [-1, 1.5, '', 'abc', '1m30', '1s2h', true, {}, Number.MAX_SAFE_INTEGER + 1])
    expect(resolveVideo('youtube', { id: youtubeId, start })).toBeNull()
})

async function renderMarkdown(source: string) {
  const { body, data } = await parseMarkdown(source, { highlight: false })
  const app = createSSRApp({ render: () => h(MDCRenderer, {
    body,
    data,
    components: { bilibili: Bilibili, youtube: Youtube, p: 'p', a: 'a', pre: 'pre', code: 'code' },
  }) })
  return renderToString(app)
}

test('真实 MDC 首屏渲染两个独立播放器，保留标题、懒加载、全屏和平台链接', async () => {
  const html = await renderMarkdown(`::bilibili{bvid="${bvid}" title="B 站演示" p="2"}\n::\n\n::youtube{id="${youtubeId}" title="YouTube 演示" start="90"}\n::\n\n后续正文`)
  expect(html.match(/<iframe\b/g)).toHaveLength(2)
  expect(html).toContain('data-prose-card="bilibili"')
  expect(html).toContain('data-prose-card="youtube"')
  expect(html).toContain('title="B 站演示 · Bilibili 播放器"')
  expect(html).toContain('title="YouTube 演示 · YouTube 播放器"')
  expect(html.match(/loading="lazy"/g)).toHaveLength(2)
  expect(html.match(/allowfullscreen/g)).toHaveLength(2)
  expect(html.match(/referrerpolicy="strict-origin-when-cross-origin"/g)).toHaveLength(2)
  expect(html.match(/target="_blank" rel="noopener noreferrer"/g)).toHaveLength(2)
  expect(html).toContain(`href="https://www.bilibili.com/video/${bvid}/?p=2"`)
  expect(html).toContain(`href="https://www.youtube.com/watch?v=${youtubeId}&amp;t=90s"`)
  expect(html).toContain('<p>后续正文</p>')
})

test('链接写法可用，代码示例和普通链接不自动转换', async () => {
  const html = await renderMarkdown(`::youtube{src="https://youtu.be/${youtubeId}"}\n::\n\n[普通链接](https://youtu.be/${youtubeId})\n\n\`\`\`md\n::bilibili{bvid="${bvid}"}\n::\n\`\`\``)
  expect(html.match(/<iframe\b/g)).toHaveLength(1)
  expect(html).toContain(`href="https://youtu.be/${youtubeId}"`)
  expect(html).toContain('::bilibili')
})

test('无效卡片不嵌入外部地址，标题作为纯文本，插槽中的正文不会被吞掉', async () => {
  const html = await renderMarkdown('::bilibili{bvid="bad" title="<script>alert(1)</script>"}\n\n保留这段正文\n\n::\n\n::youtube\n::')
  expect(html).not.toContain('<iframe')
  expect(html).not.toContain('<script>')
  expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  expect(html.match(/无法显示视频/g)).toHaveLength(2)
  expect(html).toContain('<p>保留这段正文</p>')
})
