import type { Element } from '@xmldom/xmldom'
import assert from 'node:assert/strict'
import { DOMParser } from '@xmldom/xmldom'
import { rssPostSchema } from '../../shared/rss/feed.ts'
import { pageUrl } from '../../shared/site/url.ts'

export function parseXml(source: string) {
  return new DOMParser({
    onError(level, message) {
      // U+FFFD is legal XML and is our deliberate replacement for invalid input.
      if (level === 'warning' && message === 'Unicode replacement character detected, source encoding issues?')
        return
      throw new Error(message)
    },
  }).parseFromString(source, 'application/xml')
}

export function elementText(element: Element, name: string): string {
  const matches = element.getElementsByTagName(name)
  assert.equal(matches.length, 1, `RSS 字段应唯一：${name}`)
  return matches.item(0)!.textContent
}

function normalizedText(value: string): string {
  return value.replace(/[^\t\n\r\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, '\uFFFD')
}

export function assertRss(source: string, rows: unknown, siteUrl: string, baseURL = '/') {
  const posts = rssPostSchema.array().parse(rows)
  const doc = parseXml(source)
  assert.equal(doc.documentElement?.tagName, 'rss')
  assert.equal(doc.documentElement.getAttribute('version'), '2.0')
  const channels = doc.getElementsByTagName('channel')
  assert.equal(channels.length, 1)
  const self = doc.getElementsByTagNameNS('http://www.w3.org/2005/Atom', 'link')
  assert.equal(self.length, 1)
  assert.equal(self.item(0)!.getAttribute('href'), pageUrl(siteUrl, baseURL, '/rss.xml'))
  const items = Array.from(doc.getElementsByTagName('item'))
  assert.equal(items.length, posts.length, 'RSS 数量与内容索引不一致')
  const expected = new Map(posts.map(post => [pageUrl(siteUrl, baseURL, post.path), post]))
  let previous: { publish: string, path: string } | undefined
  for (const item of items) {
    const link = elementText(item, 'link')
    const post = expected.get(link)
    assert(post, `RSS 中存在非预期或重复文章：${link}`)
    expected.delete(link)
    assert.equal(elementText(item, 'guid'), link)
    assert.equal(item.getElementsByTagName('guid').item(0)!.getAttribute('isPermaLink'), 'true')
    assert.equal(elementText(item, 'title'), normalizedText(post.title))
    const description = parseXml(`<text>${elementText(item, 'description')}</text>`)
    assert.equal(description.documentElement!.childNodes.length, post.description ? 1 : 0)
    if (post.description)
      assert.equal(description.documentElement!.firstChild!.nodeType, 3, '摘要必须是纯文本')
    assert.equal(description.documentElement!.textContent, normalizedText(post.description))
    assert.equal(Date.parse(elementText(item, 'pubDate')), Date.parse(`${post.publish}T00:00:00+08:00`))
    assert(item.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/', 'creator').item(0)?.textContent)
    if (previous) {
      assert(previous.publish > post.publish || (previous.publish === post.publish && previous.path < post.path), 'RSS 文章顺序错误')
    }
    previous = post
  }
  assert.equal(expected.size, 0)
}
