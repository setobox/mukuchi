import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { pageUrl } from '../shared/site/url.ts'

const root = new URL('../', import.meta.url)
const database = new DatabaseSync(fileURLToPath(new URL('.data/content/contents.sqlite', root)), { readOnly: true })
let paths: string[]
try {
  paths = database.prepare('SELECT path FROM _content_posts ORDER BY path').all().map((row) => {
    assert.equal(typeof row.path, 'string')
    return row.path as string
  })
}
finally {
  database.close()
}
const publicRoot = new URL('.output/public/', root)
for (const path of ['/about', ...paths]) {
  const directory = new URL(`${path.slice(1)}/`, publicRoot)
  const html = await readFile(new URL('index.html', directory), 'utf8')
  assert(html.includes(pageUrl('https://blog.setobox.me', '/', path)), `缺少正式链接：${path}`)
  await access(new URL('_payload.json', directory))
}
for (const path of ['posts', 'categories', 'tags', 'tools']) {
  await assert.rejects(access(new URL(`${path}/index.html`, publicRoot)), `列表页不能预渲染：/${path}`)
}
console.log(`预渲染验收通过：${paths.length} 篇文章与关于页；列表保持 SSR。`)
