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
  rssPosts = database.prepare('SELECT path, title, description, publish, "update" FROM _content_posts').all()
  descriptions = new Map(database.prepare('SELECT path, description, summarySource FROM _content_posts').all().map(row => [String(row.path), { text: String(row.description), ai: row.summarySource === 'ai' }]))
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
for (const path of ['/about', ...paths]) {
  const directory = new URL(`${path.slice(1)}/`, publicRoot)
  const html = await readFile(new URL('index.html', directory), 'utf8')
  assert(html.includes(pageUrl('https://blog.setobox.me', '/', path)), `缺少正式链接：${path}`)
  const description = descriptions.get(path)
  if (description) {
    const escaped = description.text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[char]!)
    assert(html.includes(`<meta name="description" content="${escaped}">`), `SEO 简介须与内容索引一致：${path}`)
    assert.equal(html.includes('aria-label="AI 摘要"'), description.ai, `摘要卡片须与摘要来源一致：${path}`)
    if (description.ai)
      assert(html.includes(`${escaped}</p>`), `摘要卡片须与内容索引一致：${path}`)
  }
  await access(new URL('_payload.json', directory))
}
for (const path of ['posts', 'categories', 'tags', 'tools']) {
  await assert.rejects(access(new URL(`${path}/index.html`, publicRoot)), `列表页不能预渲染：/${path}`)
}
console.log(`预渲染验收通过：${paths.length} 篇文章、关于页与 RSS；列表保持 SSR。`)
