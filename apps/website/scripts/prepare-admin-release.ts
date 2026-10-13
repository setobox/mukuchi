import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { z } from 'zod'
import { readWorkerEnvironment, validateWorkerEnvironment } from './worker-environment.ts'

const path = '.output/server/wrangler.json'
const config = z.object({ name: z.string(), d1_databases: z.array(z.object({ binding: z.string(), database_id: z.string().optional() })), r2_buckets: z.array(z.object({ binding: z.string(), bucket_name: z.string() })).optional(), vars: z.record(z.string(), z.unknown()) }).parse(JSON.parse(readFileSync(path, 'utf8')))
const adminId = config.d1_databases.find(db => db.binding === 'ADMIN_DB')?.database_id
assert.ok(z.uuid().safeParse(adminId).success, 'ADMIN_DB 必须配置实际数据库 ID')
assert.ok(!config.d1_databases.some(db => db.binding !== 'ADMIN_DB' && db.database_id === adminId), '账号数据库不能复用内容或统计数据库')
const require = createRequire(import.meta.url)
const wrangler = join(dirname(require.resolve('wrangler/package.json')), 'bin/wrangler.js')
validateWorkerEnvironment(await readWorkerEnvironment(process.env.CLOUDFLARE_ACCOUNT_ID || '', config.name, process.env.CLOUDFLARE_API_TOKEN || ''))
assert.ok(config.r2_buckets?.some(bucket => bucket.binding === 'ADMIN_ASSETS' && bucket.bucket_name === 'mukuchi-draft-assets'), '缺少私有图片桶绑定')
for (const name of ['PUBLIC_GISCUS_REPO_ID', 'PUBLIC_GISCUS_CATEGORY_ID']) assert.ok(z.string().min(1).safeParse(config.vars[name]).success, `缺少评论配置：${name}`)
assert.ok(config.r2_buckets?.some(bucket => bucket.binding === 'AUDIO_ASSETS' && bucket.bucket_name === 'mukuchi-audio'), '音频必须使用独立私有桶 mukuchi-audio')
execFileSync(process.execPath, [wrangler, 'd1', 'migrations', 'apply', 'mukuchi-admin', '--remote', '--config', 'wrangler.jsonc'], { stdio: 'inherit', windowsHide: true })
console.log('账号与后台发布前置检查完成。')
