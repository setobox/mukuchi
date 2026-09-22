import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { taxonomyPath } from '../shared/content/taxonomy.ts'
import { rssCacheControl, rssContentType } from '../shared/rss/config.ts'
import { assertRss } from './lib/rss.ts'

const origin = new URL(process.env.MUKUCHI_SMOKE_URL || 'http://127.0.0.1:8787')
assert(['http:', 'https:'].includes(origin.protocol))
const db = new DatabaseSync(fileURLToPath(new URL('../.data/content/contents.sqlite', import.meta.url)), { readOnly: true })
const posts = db.prepare('SELECT path, title, description, publish, "update", tags, categories FROM _content_posts ORDER BY path').all()
db.close()
function terms(value: unknown): string[] {
  assert.equal(typeof value, 'string')
  const parsed: unknown = JSON.parse(value as string)
  assert(Array.isArray(parsed) && parsed.every(name => typeof name === 'string'))
  return parsed
}
async function request(path: string, cookie = '') {
  return fetch(new URL(path, origin), { redirect: 'manual', headers: { cookie }, signal: AbortSignal.timeout(30_000) })
}
async function list(path: string, count: number, view = 'list') {
  const response = await request(path, `mukuchi:post-view=${view}`)
  assert.equal(response.status, 200, path)
  assert(response.headers.get('cache-control')?.includes('no-store'), path)
  const html = (await response.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '')
  assert.equal((html.match(/<article\b/g) || []).length, count, path)
  assert(new RegExp(`aria-label="${view === 'grid' ? '卡片' : '列表'}显示"[^>]*aria-pressed="true"`).test(html), `${path} 的首屏显示偏好`)
}
const home = await request('/')
assert.equal(home.status, 302)
assert.equal(home.headers.get('location'), '/posts')
const favicon = await request('/favicon.ico')
assert.equal(favicon.status, 200, '浏览器静态图标')
assert.match(favicon.headers.get('content-type') || '', /^image\/(?:x-icon|vnd\.microsoft\.icon)(?:;|$)/)
const faviconBytes = Buffer.from(await favicon.arrayBuffer())
assert.deepEqual([...faviconBytes.subarray(0, 4)], [0, 0, 1, 0], '有效 ICO 文件')
assert.deepEqual(faviconBytes, await readFile(new URL('../public/favicon.ico', import.meta.url)), '图标静态资源内容')
const rss = await request('/rss.xml')
assert.equal(rss.status, 200, 'RSS')
assert.equal(rss.headers.get('content-type'), rssContentType)
assert.equal(rss.headers.get('cache-control'), rssCacheControl)
assertRss(await rss.text(), posts, 'https://blog.setobox.me')
for (const view of ['list', 'grid']) {
  await list('/posts?tag=missing&category=missing', posts.length, view)
  await list('/categories?tag=missing&category=missing', posts.length, view)
}
for (const [kind, field] of [['tag', 'tags'], ['category', 'categories']] as const) {
  const names = new Set(posts.flatMap(post => terms(post[field])))
  for (const name of names) {
    const count = posts.filter(post => terms(post[field]).includes(name)).length
    await list(`${taxonomyPath(kind, name)}?tag=missing&category=missing`, count)
  }
  assert.equal((await request(taxonomyPath(kind, '__deployment_missing__'))).status, 404)
}
for (const path of ['/about', '/use', ...posts.map(post => String(post.path))]) {
  const response = await request(path)
  assert.equal(response.status, 200, path)
  const html = await response.text()
  if (path === '/use') {
    assert.match(html, /<title>Use - Setobox<\/title>/, 'Use 页面标题')
    assert.match(html, /<meta name="description" content="我正在使用的开发工具、设计软件与硬件设备。">/, 'Use SEO 简介')
    const aboutLinks = html.match(/<a\b[^>]+href="\/about"[^>]*>/g) ?? []
    assert(aboutLinks.some(link => link.includes('aria-current="page"')), 'Use 归属关于分区')
    assert(html.includes('AMD Ryzen 9 9950X3D'), 'Use 正文已渲染')
  }
  assert(html.includes('https://blog.setobox.me'), `正式地址：${path}`)
  assert(/<link\s[^>]*rel="icon"[^>]*href="\/favicon\.ico"/.test(html), `页面使用本地静态图标：${path}`)
  assert(/<link\s[^>]*rel="alternate"[^>]*href="https:\/\/blog\.setobox\.me\/rss\.xml"/.test(html), `RSS 自动发现：${path}`)
  assert.equal((await request(`${path}/_payload.json`)).status, 200, `${path} payload`)
}
assert.equal((await request('/posts/__deployment_missing__')).status, 404)
for (const [path, title] of [['/tools', '工具'], ['/tools/cover', '封面制作器']]) {
  const response = await request(path!)
  assert.equal(response.status, 200, path)
  assert.match(await response.text(), new RegExp(`<h1[^>]*>\\s*${title}\\s*</h1>`), `${path} 页面标题`)
}
console.log(`HTTP 验收通过：${origin.origin}，${posts.length} 篇文章、Use 页、RSS、浏览器图标、全部专栏和标签、封面工具、Cookie 与错误状态。`)
