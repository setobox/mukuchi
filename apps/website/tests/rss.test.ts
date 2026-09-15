import type { RssPost, RssSite } from '../shared/rss/feed'
import { expect, test } from 'vite-plus/test'
import { assertRss, elementText, parseXml } from '../scripts/lib/rss'
import { createRssFeed } from '../shared/rss/feed'

const site: RssSite = {
  name: 'Setobox',
  description: '博客介绍',
  author: '姬顶盒',
  siteUrl: 'https://blog.setobox.me',
  baseURL: '/',
}
const post: RssPost = { path: '/posts/example', title: '文章', description: '摘要', publish: '2024-03-01' }
const items = (source: string) => Array.from(parseXml(source).getElementsByTagName('item'))

test('RSS 保留中文与特殊字符，摘要中的 HTML 作为文字显示', () => {
  const text = '中文 😀 <script> & "引号" \'单引号\' ]]> &lt;\r\n第二行'
  const xml = createRssFeed([{ ...post, title: text, description: text }], { ...site, name: text, author: text })
  const [item] = items(xml)
  expect(elementText(item!, 'title')).toBe(text)
  expect(elementText(item!, 'dc:creator')).toBe(text)
  const description = parseXml(`<text>${elementText(item!, 'description')}</text>`).documentElement!
  expect(description.textContent).toBe(text)
  expect(description.getElementsByTagName('*').length).toBe(0)
})

test('非法 XML 控制字符和孤立代理字符替换为替代字符，保留合法 Unicode', () => {
  const posts = [{ ...post, title: 'a\u0000\u0001\uD800\uFFFFb\t😀', description: '\uDC00摘要' }]
  const xml = createRssFeed(posts, site)
  expect(() => assertRss(xml, posts, site.siteUrl)).not.toThrow()
  const [item] = items(xml)
  expect(elementText(item!, 'title')).toBe('a����b\t😀')
  expect(elementText(item!, 'description')).toBe('�摘要')
})

test('发布日期降序、同日路径升序，不受置顶、施工或未来日期影响且不截断', () => {
  const posts = Array.from({ length: 60 }, (_, index) => ({
    ...post,
    path: `/posts/${String(index).padStart(2, '0')}`,
    publish: index === 59 ? '2099-01-01' : '2024-03-01',
    pin: index === 10 ? 99 : 0,
    wip: index === 20,
  })).reverse()
  const before = JSON.stringify(posts)
  const links = items(createRssFeed(posts, site)).map(item => elementText(item, 'link'))
  expect(links).toHaveLength(60)
  expect(links[0]).toBe('https://blog.setobox.me/posts/59')
  expect(links.slice(1)).toEqual(Array.from({ length: 59 }, (_, index) => `https://blog.setobox.me/posts/${String(index).padStart(2, '0')}`))
  expect(JSON.stringify(posts)).toBe(before)
})

test('RSS 使用北京时间零点，更新摘要不改变永久标识和发布日期', () => {
  const oldXml = createRssFeed([post], site)
  const newXml = createRssFeed([{ ...post, description: '新摘要', update: '2024-03-02' }], site)
  const [oldItem] = items(oldXml)
  const [newItem] = items(newXml)
  expect(elementText(oldItem!, 'pubDate')).toBe('Fri, 01 Mar 2024 00:00:00 +0800')
  expect(Date.parse(elementText(oldItem!, 'pubDate'))).toBe(Date.parse('2024-02-29T16:00:00Z'))
  expect(elementText(newItem!, 'pubDate')).toBe(elementText(oldItem!, 'pubDate'))
  expect(elementText(newItem!, 'guid')).toBe(elementText(oldItem!, 'guid'))
  expect(parseXml(newXml).getElementsByTagName('lastBuildDate').item(0)!.textContent).toBe('Sat, 02 Mar 2024 00:00:00 +0800')
  expect(createRssFeed([post], site)).toBe(oldXml)
})

test.each([
  ['1970-01-01', 'Thu, 01 Jan 1970 00:00:00 +0800'],
  ['2024-02-29', 'Thu, 29 Feb 2024 00:00:00 +0800'],
  ['2026-01-01', 'Thu, 01 Jan 2026 00:00:00 +0800'],
])('RSS 保留源日期的年份、月份和日期：%s', (publish, expected) => {
  const [item] = items(createRssFeed([{ ...post, publish }], site))
  expect(elementText(item!, 'pubDate')).toBe(expected)
  expect(Date.parse(elementText(item!, 'pubDate'))).toBe(Date.parse(`${publish}T00:00:00+08:00`))
})

test('永久链接和自引用使用正式域名，保留中文编码与部署子路径', () => {
  const xml = createRssFeed([{ ...post, path: '/posts/中文/C%23' }], { ...site, baseURL: '/blog/' })
  const [item] = items(xml)
  expect(elementText(item!, 'link')).toBe('https://blog.setobox.me/blog/posts/%E4%B8%AD%E6%96%87/C%23')
  const self = parseXml(xml).getElementsByTagNameNS('http://www.w3.org/2005/Atom', 'link').item(0)!
  expect(self.getAttribute('href')).toBe('https://blog.setobox.me/blog/rss.xml')
  expect(() => createRssFeed([post], { ...site, siteUrl: 'invalid' })).toThrow()
  expect(() => createRssFeed([{ ...post, path: '//evil.example' }], site)).toThrow()
})

test('空集合返回合法频道，缺省或数据库 null 更新日期使用发布日期', () => {
  const empty = parseXml(createRssFeed([], site))
  expect(empty.getElementsByTagName('channel').length).toBe(1)
  expect(empty.getElementsByTagName('item').length).toBe(0)
  expect(empty.getElementsByTagName('lastBuildDate').length).toBe(0)
  expect(createRssFeed([{ ...post, update: null }], site)).toBe(createRssFeed([post], site))
})

test.each([
  { publish: '2023-02-29' },
  { publish: '2024-13-01' },
  { publish: 'not-a-date' },
  { update: '2024-02-01' },
  { update: '2024-02-30' },
])('无效持久化日期阻止生成：%j', (fields) => {
  expect(() => createRssFeed([{ ...post, ...fields }], site)).toThrow()
})
