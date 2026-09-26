import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { DOMParser } from '@xmldom/xmldom'
import { postPageSize } from '../app/features/posts/pagination.ts'
import { comparePostOrder } from '../shared/content/catalog.ts'
import { collectSeries } from '../shared/content/series.ts'
import { taxonomyPath } from '../shared/content/taxonomy.ts'
import { rssCacheControl, rssContentType } from '../shared/rss/config.ts'
import { assertRss } from './lib/rss.ts'

const origin = new URL(process.env.MUKUCHI_SMOKE_URL || 'http://127.0.0.1:8787')
assert(['http:', 'https:'].includes(origin.protocol))
const db = new DatabaseSync(fileURLToPath(new URL('../.data/content/contents.sqlite', import.meta.url)), { readOnly: true })
const posts = db.prepare('SELECT path, stem, title, description, publish, "update", tags, categories, series, seriesOrder FROM _content_posts ORDER BY path').all()
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
  assert.equal((html.match(/<article\b/g) || []).length, Math.min(count, postPageSize), path)
  assert(new RegExp(`aria-label="${view === 'grid' ? '卡片' : '列表'}显示"[^>]*aria-pressed="true"`).test(html), `${path} 的首屏显示偏好`)
}
async function browse() {
  for (const [path, title, field] of [['/categories', '分类', 'categories'], ['/tags', '标签', 'tags'], ['/archive', '归档', null]] as const) {
    const response = await request(path)
    assert.equal(response.status, 200, path)
    assert(response.headers.get('cache-control')?.includes('no-store'), path)
    const html = (await response.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '')
    // Vite's dev stylesheet URLs contain bare ampersands, valid in HTML but
    // rejected by this XML-backed parser. Preserve existing entity references.
    const document = new DOMParser().parseFromString(html.replace(/&(?!#(?:\d+|x[\da-f]+);|[a-z][\da-z]+;)/gi, '&amp;'), 'text/html')
    assert.equal(document.getElementsByTagName('h1')[0]?.textContent?.trim(), title)
    assert.equal(document.getElementsByTagName('article').length, 0, `${path} 不展示文章卡片`)
    const canonical = [...document.getElementsByTagName('link')].find(link => link.getAttribute('rel') === 'canonical')
    assert.equal(canonical?.getAttribute('href'), `https://blog.setobox.me${path}`)
    assert([...document.getElementsByTagName('meta')].some(meta => meta.getAttribute('name') === 'description' && meta.getAttribute('content')), `${path} 的 SEO 简介`)
    if (field) {
      const counts = new Map<string, number>()
      for (const post of posts) {
        for (const name of new Set(terms(post[field]))) counts.set(name, (counts.get(name) ?? 0) + 1)
      }
      const expected = [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      const entries = [...document.getElementsByTagName('a')].filter(link => link.getAttribute('aria-label')?.endsWith('篇文章'))
      assert.deepEqual(entries.map(link => [link.getAttribute('href'), link.getAttribute('aria-label')]), expected.map(([name, count]) => [taxonomyPath(field === 'tags' ? 'tag' : 'category', name), `${name}，${count} 篇文章`]))
    }
    else {
      const timeline = [...document.getElementsByTagName('section')].find(section => section.getAttribute('aria-label') === '文章时间线')!
      const chronological = posts.map(post => ({ path: String(post.path), publish: String(post.publish), stem: typeof post.stem === 'string' ? post.stem : undefined })).sort(comparePostOrder)
      assert.deepEqual([...timeline.getElementsByTagName('a')].map(link => link.getAttribute('href')), chronological.map(post => post.path))
      const years = new Set(chronological.map(post => String(post.publish).slice(0, 4)))
      const triggers = [...timeline.getElementsByTagName('button')]
      assert.equal(triggers.length, years.size)
      assert.deepEqual(triggers.map(button => button.getAttribute('aria-expanded')), [...years].map((_, index) => String(index === 0)))
    }
  }
}
async function seriesBrowse() {
  const groups = collectSeries(posts.map(post => ({ path: String(post.path), title: String(post.title), publish: String(post.publish), series: typeof post.series === 'string' ? post.series : undefined, seriesOrder: typeof post.seriesOrder === 'number' ? post.seriesOrder : undefined })))
  async function documentAt(path: string) {
    const response = await request(path)
    assert.equal(response.status, 200, path)
    const html = (await response.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '')
    return { response, document: new DOMParser().parseFromString(html.replace(/&(?!#(?:\d+|x[\da-f]+);|[a-z][\da-z]+;)/gi, '&amp;'), 'text/html') }
  }
  const { document, response } = await documentAt('/series')
  assert(response.headers.get('cache-control')?.includes('no-store'))
  assert.equal(document.getElementsByTagName('h1')[0]?.textContent?.trim(), '系列')
  assert([...document.getElementsByTagName('link')].some(link => link.getAttribute('rel') === 'canonical' && link.getAttribute('href') === 'https://blog.setobox.me/series'))
  assert([...document.getElementsByTagName('meta')].some(meta => meta.getAttribute('name') === 'description' && meta.getAttribute('content')))
  const directory = [...document.getElementsByTagName('section')].find(section => section.getAttribute('aria-label') === '系列目录')
  if (!groups.length) {
    assert(!directory)
    assert(document.toString().includes('暂无系列'))
  }
  else {
    assert(directory)
    assert.deepEqual([...directory.getElementsByTagName('a')].map(link => link.getAttribute('href')), groups.flatMap(group => group.posts.map(post => post.path)))
    assert.deepEqual([...directory.getElementsByTagName('button')].map(button => [button.getAttribute('aria-label'), button.getAttribute('aria-expanded')]), groups.map(group => [`${group.name}，${group.posts.length} 篇文章`, 'false']))
  }
  for (const group of groups) {
    for (const [index, post] of group.posts.entries()) {
      const { document } = await documentAt(post.path)
      const section = [...document.getElementsByTagName('section')].find(section => section.getAttribute('aria-label') === '同系列文章')
      assert(section, `${post.path} 的系列目录`)
      assert(section.textContent?.includes(`正在阅读第 ${index + 1} 篇`))
      assert.deepEqual([...section.getElementsByTagName('a')].map(link => link.getAttribute('href')), group.posts.map(post => post.path))
      assert.deepEqual([...section.getElementsByTagName('a')].filter(link => link.getAttribute('aria-current') === 'page').map(link => link.getAttribute('href')), [post.path])
      const article = document.getElementsByTagName('article')[0]!
      assert(article.toString().indexOf('同系列文章') < article.toString().indexOf('article-body'), '系列目录位于正文前')
    }
  }
  const legacy = posts.find(post => !post.series)
  if (legacy) {
    const { document } = await documentAt(String(legacy.path))
    assert(!document.toString().includes('aria-label="同系列文章"'), '旧文章不显示系列目录')
  }
  assert.equal((await request('/api/stats/page?path=%2Fseries')).status, 200)
  console.log(`系列 HTTP 验收通过：${groups.length} 个系列，${groups.reduce((sum, group) => sum + group.posts.length, 0)} 篇关联文章。`)
}
await browse()
await seriesBrowse()
if (process.argv.includes('--browse-only')) {
  console.log('内容浏览 HTTP 验收通过：归档排序与初始展开、分类与标签计数及链接、SSR 与 SEO。')
  process.exit(0)
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
    assert(
      aboutLinks.some(link => link.includes('aria-current="location"')),
      'Use 归属关于分区',
    )
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
