import assert from 'node:assert/strict'
import process from 'node:process'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { taxonomyPath } from '../shared/content/taxonomy.ts'

const origin = new URL(process.env.MUKUCHI_SMOKE_URL || 'http://127.0.0.1:8787')
assert(['http:', 'https:'].includes(origin.protocol))
const db = new DatabaseSync(fileURLToPath(new URL('../.data/content/contents.sqlite', import.meta.url)), { readOnly: true })
const posts = db.prepare('SELECT path, tags, categories FROM _content_posts ORDER BY path').all()
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
for (const path of ['/about', ...posts.map(post => String(post.path))]) {
  const response = await request(path)
  assert.equal(response.status, 200, path)
  const html = await response.text()
  assert(html.includes('https://blog.setobox.me'), `正式地址：${path}`)
  assert.equal((await request(`${path}/_payload.json`)).status, 200, `${path} payload`)
}
assert.equal((await request('/posts/__deployment_missing__')).status, 404)
console.log(`HTTP 验收通过：${origin.origin}，${posts.length} 篇文章、全部专栏和标签、Cookie 与错误状态。`)
