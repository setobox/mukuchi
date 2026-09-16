import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import './stats-environment.ts'

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)])
}
const build = z.object({ enabled: z.boolean() }).parse(JSON.parse(readFileSync('.output/admin-build.json', 'utf8')))
const forbidden = ['NUXT_GITHUB_CLIENT_SECRET', 'NUXT_GITHUB_PUBLISH_TOKEN', 'NUXT_STATS_HASH_SECRET', 'NUXT_STATS_ADMIN_TOKEN'].map(key => process.env[key]).filter((value): value is string => !!value)
const filename = process.env.NUXT_ADMIN_DATABASE_PATH || '.data/admin.sqlite'
if (existsSync(filename)) {
  const database = new DatabaseSync(filename, { readOnly: true })
  try {
    for (const table of ['admin_drafts', 'admin_assets']) {
      for (const row of database.prepare(`SELECT id FROM ${table}`).all())
        forbidden.push(String(row.id))
    }
  }
  finally { database.close() }
}
assert.ok(!existsSync('.output/public/admin'), '后台页面不得预渲染')
for (const path of files('.output/public')) {
  assert.ok(!/admin\.sqlite|admin-assets|\.env(?:\.|$)/.test(path), '私有存储不得进入静态目录')
  if (!/\.(?:html|json|js|mjs|map|txt|xml|sql)$/.test(path))
    continue
  const content = readFileSync(path, 'utf8')
  assert.ok(!forbidden.some(value => content.includes(value)), '公开产物不得包含服务端密钥、草稿标识或私有图片标识')
}
if (existsSync('.output/server/wrangler.json')) {
  const config = z.object({ d1_databases: z.array(z.object({ binding: z.string() })), r2_buckets: z.array(z.object({ binding: z.string() })).optional(), vars: z.record(z.string(), z.unknown()) }).parse(JSON.parse(readFileSync('.output/server/wrangler.json', 'utf8')))
  assert.equal(config.d1_databases.some(db => db.binding === 'ADMIN_DB'), build.enabled)
  assert.equal(config.r2_buckets?.some(bucket => bucket.binding === 'ADMIN_ASSETS') ?? false, build.enabled)
  assert.equal(config.vars.NUXT_ADMIN_ENABLED, String(build.enabled))
  for (const path of files('.output/server').filter(path => path.endsWith('.mjs'))) {
    const content = readFileSync(path, 'utf8')
    assert.ok(!content.includes('后台数据库未初始化，请先执行迁移'), 'Workers 不得包含本地后台 SQLite 适配器')
    assert.ok(!content.includes('本地文章已被修改，请对比最新版本后重新发布'), 'Workers 不得包含本地文件发布能力')
  }
}
console.log('后台产物验收通过：草稿与私有图片隔离、密钥隔离、Worker 绑定及本地能力排除。')
