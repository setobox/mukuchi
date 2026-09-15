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
try {
  rssPosts = database.prepare('SELECT path, title, description, publish, "update" FROM _content_posts').all()
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
  await access(new URL('_payload.json', directory))
}
for (const path of ['posts', 'categories', 'tags', 'tools']) {
  await assert.rejects(access(new URL(`${path}/index.html`, publicRoot)), `列表页不能预渲染：/${path}`)
}
console.log(`预渲染验收通过：${paths.length} 篇文章、关于页与 RSS；列表保持 SSR。`)
