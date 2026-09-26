import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { pageUrl } from '../shared/site/url.ts'
import { assertRss } from './lib/rss.ts'

const root = new URL('../', import.meta.url)
const database = new DatabaseSync(fileURLToPath(new URL('.data/content/contents.sqlite', root)), { readOnly: true })
let paths: string[]
let rssPosts: unknown
let descriptions: Map<string, { text: string, ai: boolean }>
try {
  rssPosts = database.prepare('SELECT path, stem, title, description, publish, "update" FROM _content_posts').all()
  descriptions = new Map(database.prepare('SELECT path, description, summarySource FROM _content_posts').all().map(row => [String(row.path), { text: String(row.description), ai: row.summarySource === 'ai' }]))
  const usePage = database.prepare('SELECT path, description FROM _content_use').get()
  assert.equal(usePage?.path, '/use')
  assert.equal(typeof usePage?.description, 'string')
  descriptions.set('/use', { text: String(usePage.description), ai: false })
  paths = database.prepare('SELECT path FROM _content_posts ORDER BY path').all().map((row) => {
    assert.equal(typeof row.path, 'string')
    return row.path as string
  })
}
finally {
  database.close()
}
const publicRoot = new URL('.output/public/', root)
assert.deepEqual(await readFile(new URL('favicon.ico', publicRoot)), await readFile(new URL('public/favicon.ico', root)), '图标静态资源进入构建产物')
assertRss(await readFile(new URL('rss.xml', publicRoot), 'utf8'), rssPosts, 'https://blog.setobox.me')
for (const path of ['/about', '/use', ...paths]) {
  const directory = new URL(`${path.slice(1)}/`, publicRoot)
  const html = (await readFile(new URL('index.html', directory), 'utf8')).replace(/<!--[\s\S]*?-->/g, '')
  assert(html.includes(pageUrl('https://blog.setobox.me', '/', path)), `缺少正式链接：${path}`)
  if (path === '/about')
    assert.match(html, /href="\/use"[^>]*>\s*Use · 我的装备/, '关于页提供 Use 入口')
  if (path === '/use') {
    assert.match(html, /<h1[^>]*>\s*Use\s*<\/h1>/, 'Use 页面标题')
    const headings = [...html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/g)].map(match => match[1]!.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').trim())
    const sections = ['Development', 'Design', 'Record', 'Note & Plan', 'Tools', 'Hardware']
    assert.deepEqual(headings.filter(heading => sections.includes(heading)), sections, '清单保留六个分组及顺序')
    assert.match(html, /<li>Terminal:\s*<ul>/, 'Terminal 保留嵌套清单')
    for (const retired of ['Claude', 'Github Copilot', 'i9-14900KF（缩肛）'])
      assert(html.includes(`<del>${retired}</del>`), `保留删除线：${retired}`)
    assert.match(html, /href="https:\/\/code.visualstudio.com\/insiders"/, 'Markdown 外链正确解析')
    assert(!html.includes('aria-label="文章目录"'), 'Use 不显示页内目录')
  }
  const description = descriptions.get(path)
  if (description) {
    const escaped = description.text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[char]!)
    // Empty post descriptions are valid; Unhead omits empty meta tags.
    const renderedDescription = html.match(/<meta name="description" content="([^"]*)">/)?.[1] ?? ''
    assert.equal(renderedDescription, escaped, `SEO 简介须与内容索引一致：${path}`)
    assert.equal(html.includes('aria-label="AI 摘要"'), description.ai, `摘要卡片须与摘要来源一致：${path}`)
    if (description.ai)
      assert(html.includes(`${escaped}</p>`), `摘要卡片须与内容索引一致：${path}`)
  }
  await access(new URL('_payload.json', directory))
}
for (const path of ['posts', 'categories', 'tags', 'tools', 'my']) {
  await assert.rejects(access(new URL(`${path}/index.html`, publicRoot)), `列表页不能预渲染：/${path}`)
}
console.log(`预渲染验收通过：${paths.length} 篇文章、关于页、Use 页与 RSS；列表保持 SSR。`)
