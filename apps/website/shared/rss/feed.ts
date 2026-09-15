import { z } from 'zod'
import { isCalendarDate, postFields } from '../content/schema.ts'
import { pageUrl } from '../site/url.ts'
import { rssPath } from './config.ts'

export const rssPostSchema = postFields.pick({ title: true, description: true, publish: true })
  .extend({ path: z.string().min(1), update: postFields.shape.update.nullish() })
  .superRefine((post, ctx) => {
    for (const field of ['publish', 'update'] as const) {
      if (post[field] && !isCalendarDate(post[field]))
        ctx.addIssue({ code: 'custom', path: [field], message: '必须是有效的 YYYY-MM-DD 日期' })
    }
    if (post.update && post.update < post.publish)
      ctx.addIssue({ code: 'custom', path: ['update'], message: '不能早于发布日期' })
  })

export type RssPost = z.infer<typeof rssPostSchema>

export interface RssSite {
  name: string
  description: string
  author: string
  siteUrl: string
  baseURL: string
}

function xmlText(value: string): string {
  // XML 1.0 allows tabs/newlines, but excludes most controls and lone surrogates.
  return Array.from(value, (character) => {
    const code = character.codePointAt(0)!
    return code === 0x9 || code === 0xA || code === 0xD
      || (code >= 0x20 && code <= 0xD7FF)
      || (code >= 0xE000 && code <= 0xFFFD)
      || (code >= 0x10000 && code <= 0x10FFFF)
      ? character
      : '\uFFFD'
  }).join('').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll('\'', '&apos;').replaceAll('\r', '&#13;')
}

function rssDate(value: string): string {
  // Format the stored calendar fields, then label Shanghai midnight with its
  // numeric offset so the XML shows the same day as the article metadata.
  return new Date(`${value}T00:00:00Z`).toUTCString().replace(' GMT', ' +0800')
}

export function createRssFeed(input: readonly RssPost[], site: RssSite): string {
  const posts = rssPostSchema.array().parse(input).sort((a, b) =>
    a.publish === b.publish
      ? (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
      : a.publish > b.publish ? -1 : 1)
  const url = (path: string) => xmlText(pageUrl(site.siteUrl, site.baseURL, path))
  const latest = posts.map(post => post.update || post.publish).sort().at(-1)
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">',
    '<channel>',
    `<title>${xmlText(site.name)}</title>`,
    `<link>${url('/posts')}</link>`,
    `<description>${xmlText(site.description)}</description>`,
    '<language>zh-CN</language>',
    `<atom:link href="${url(rssPath)}" rel="self" type="application/rss+xml"/>`,
    ...(latest ? [`<lastBuildDate>${rssDate(latest)}</lastBuildDate>`] : []),
    ...posts.map(post => [
      '<item>',
      `<title>${xmlText(post.title)}</title>`,
      `<link>${url(post.path)}</link>`,
      `<guid isPermaLink="true">${url(post.path)}</guid>`,
      // Readers interpret item descriptions as HTML after parsing XML. Escape
      // that inner layer as well so Markdown metadata stays literal plain text.
      `<description>${xmlText(xmlText(post.description))}</description>`,
      `<pubDate>${rssDate(post.publish)}</pubDate>`,
      `<dc:creator>${xmlText(site.author)}</dc:creator>`,
      '</item>',
    ].join('\n')),
    '</channel>',
    '</rss>',
    '',
  ].join('\n')
}
