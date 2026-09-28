import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { DOMParser } from '@xmldom/xmldom'
import { collectSeries } from '../shared/content/series.ts'
import { pageUrl } from '../shared/site/url.ts'
import { assertRss } from './lib/rss.ts'

const root = new URL('../', import.meta.url)
const database = new DatabaseSync(fileURLToPath(new URL('.data/content/contents.sqlite', root)), { readOnly: true })
let paths: string[]
let rssPosts: unknown
let descriptions: Map<string, { text: string }>
let series: ReturnType<typeof collectSeries>
try {
  series = collectSeries(database.prepare('SELECT path, title, publish, series, seriesOrder FROM _content_posts').all().map(row => ({ path: String(row.path), title: String(row.title), publish: String(row.publish), series: typeof row.series === 'string' ? row.series : undefined, seriesOrder: typeof row.seriesOrder === 'number' ? row.seriesOrder : undefined })))
  rssPosts = database.prepare('SELECT path, stem, title, description, publish, "update" FROM _content_posts').all()
  descriptions = new Map(database.prepare('SELECT path, description FROM _content_posts').all().map(row => [String(row.path), { text: String(row.description) }]))
  paths = database.prepare('SELECT path FROM _content_posts ORDER BY path').all().map((row) => {
    assert.equal(typeof row.path, 'string')
    return row.path as string
  })
}
finally {
  database.close()
}
const publicRoot = new URL('.output/public/', root)
const collectionsHtml = await readFile(new URL('collections/index.html', publicRoot), 'utf8')
assert.match(collectionsHtml, /<h1[^>]*>\s*导航\s*<\/h1>/, '导航页预渲染标题')
assert(collectionsHtml.includes('网站、开发资源与在线工具收藏。'), '导航页预渲染简介')
assert(collectionsHtml.includes('正在加载'), '导航页只预渲染外壳，数据由客户端加载')
assert(!collectionsHtml.includes('aria-label="侧边栏"'), '导航页不显示博客侧栏')
assert.deepEqual(await readFile(new URL('favicon.ico', publicRoot)), await readFile(new URL('public/favicon.ico', root)), '图标静态资源进入构建产物')
assertRss(await readFile(new URL('rss.xml', publicRoot), 'utf8'), rssPosts, 'https://blog.setobox.me')
for (const path of ['/about', ...paths]) {
  const directory = new URL(`${path.slice(1)}/`, publicRoot)
  const html = (await readFile(new URL('index.html', directory), 'utf8')).replace(/<!--[\s\S]*?-->/g, '')
  assert(html.includes(pageUrl('https://blog.setobox.me', '/', path)), `缺少正式链接：${path}`)
  if (path === '/about')
    assert.match(html, /href="\/use"[^>]*>\s*Use · 我的装备/, '关于页提供 Use 入口')
  const description = descriptions.get(path)
  if (paths.includes(path)) {
    const group = series.find(group => group.posts.some(post => post.path === path))
    const document = new DOMParser().parseFromString(html, 'text/html')
    const section = [...document.getElementsByTagName('section')].find(section => section.getAttribute('aria-label') === '同系列文章')
    if (group) {
      assert(section, `${path} 预渲染保留系列目录`)
      assert.deepEqual([...section.getElementsByTagName('a')].map(link => link.getAttribute('href')), group.posts.map(post => post.path))
      assert.deepEqual([...section.getElementsByTagName('a')].filter(link => link.getAttribute('aria-current') === 'page').map(link => link.getAttribute('href')), [path])
      assert.equal(section.getElementsByTagName('button')[0]?.getAttribute('aria-expanded'), 'false')
    }
    else {
      assert(!section, `${path} 未设置系列时保持旧行为`)
    }
  }
  if (description) {
    const escaped = description.text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[char]!)
    // Empty post descriptions are valid; Unhead omits empty meta tags.
    const renderedDescription = html.match(/<meta name="description" content="([^"]*)">/)?.[1] ?? ''
    assert.equal(renderedDescription, escaped, `SEO 简介须与内容索引一致：${path}`)
    const hasSummary = paths.includes(path) && !!description.text.trim()
    assert.equal(html.includes('aria-label="文章摘要"'), hasSummary, `摘要卡片须与文章简介一致：${path}`)
    if (hasSummary)
      assert(html.includes(`${escaped}</p>`), `摘要卡片须与内容索引一致：${path}`)
  }
  await access(new URL('_payload.json', directory))
}
for (const path of ['posts', 'categories', 'tags', 'archive', 'series', 'tools', 'my']) {
  await assert.rejects(access(new URL(`${path}/index.html`, publicRoot)), `列表页不能预渲染：/${path}`)
}
console.log(`预渲染验收通过：${paths.length} 篇文章、关于页、导航页外壳与 RSS；文章列表保持 SSR。`)
