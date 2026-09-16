import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { z } from 'zod'

const build = z.object({ enabled: z.boolean() }).parse(JSON.parse(readFileSync('.output/admin-build.json', 'utf8')))
if (build.enabled) {
  const path = '.output/server/wrangler.json'
  const config = z.object({ d1_databases: z.array(z.object({ binding: z.string(), database_id: z.string().optional() })), r2_buckets: z.array(z.object({ binding: z.string(), bucket_name: z.string() })), vars: z.object({ NUXT_PUBLIC_AUTH_ENABLED: z.literal('true'), NUXT_PUBLIC_GISCUS_REPO_ID: z.string().min(1), NUXT_PUBLIC_GISCUS_CATEGORY_ID: z.string().min(1) }) }).parse(JSON.parse(readFileSync(path, 'utf8')))
  const adminId = config.d1_databases.find(db => db.binding === 'ADMIN_DB')?.database_id
  assert.ok(z.uuid().safeParse(adminId).success, 'ADMIN_DB 必须配置实际数据库 ID')
  assert.ok(!config.d1_databases.some(db => db.binding !== 'ADMIN_DB' && db.database_id === adminId), '后台数据库不能复用内容或统计数据库')
  assert.ok(config.r2_buckets.some(bucket => bucket.binding === 'ADMIN_ASSETS' && bucket.bucket_name === 'mukuchi-draft-assets'), '缺少私有图片桶绑定')
  const require = createRequire(import.meta.url)
  const wrangler = join(dirname(require.resolve('wrangler/package.json')), 'bin/wrangler.js')
  const output = execFileSync(process.execPath, [wrangler, 'secret', 'list', '--format', 'json', '--config', path], { encoding: 'utf8', windowsHide: true })
  const secrets = z.array(z.object({ name: z.string() })).parse(JSON.parse(output)).map(item => item.name)
  for (const name of ['NUXT_GITHUB_CLIENT_ID', 'NUXT_GITHUB_CLIENT_SECRET', 'NUXT_GITHUB_PUBLISH_TOKEN', 'NUXT_AI_ENCRYPTION_KEY']) assert.ok(secrets.includes(name), `缺少 Worker Secret：${name}`)
  execFileSync(process.execPath, [wrangler, 'd1', 'migrations', 'apply', 'mukuchi-admin', '--remote', '--config', 'wrangler.jsonc'], { stdio: 'inherit', windowsHide: true })
}
console.log('后台发布前置检查完成。')
