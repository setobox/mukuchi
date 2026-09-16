import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import process from 'node:process'
import { z } from 'zod'
import './stats-environment.ts'

const enabled = process.env.NUXT_ADMIN_ENABLED === 'true'
writeFileSync('.output/admin-build.json', JSON.stringify({ enabled }))
const path = '.output/server/wrangler.json'
if (existsSync(path)) {
  const config = z.object({ d1_databases: z.array(z.object({ binding: z.string() }).passthrough()).optional(), r2_buckets: z.array(z.object({ binding: z.string() }).passthrough()).optional(), vars: z.record(z.string(), z.unknown()).optional() }).passthrough().parse(JSON.parse(readFileSync(path, 'utf8')))
  if (!enabled) {
    config.d1_databases = config.d1_databases?.filter(db => db.binding !== 'ADMIN_DB')
    config.r2_buckets = config.r2_buckets?.filter(bucket => bucket.binding !== 'ADMIN_ASSETS')
  }
  config.vars = { ...config.vars, NUXT_ADMIN_ENABLED: String(enabled), NUXT_PUBLIC_AUTH_ENABLED: String(enabled), NUXT_PUBLIC_GISCUS_REPO: process.env.NUXT_PUBLIC_GISCUS_REPO || 'setobox/mukuchi', NUXT_PUBLIC_GISCUS_REPO_ID: process.env.NUXT_PUBLIC_GISCUS_REPO_ID || '', NUXT_PUBLIC_GISCUS_CATEGORY_ID: process.env.NUXT_PUBLIC_GISCUS_CATEGORY_ID || '' }
  writeFileSync(path, JSON.stringify(config, null, 2))
}
console.log(`后台构建配置：${enabled ? '已启用' : '已关闭'}。`)
