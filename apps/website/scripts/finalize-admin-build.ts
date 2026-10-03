import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import process from 'node:process'
import { z } from 'zod'
import './stats-environment.ts'

writeFileSync('.output/admin-build.json', JSON.stringify({ available: true }))
const path = '.output/server/wrangler.json'
if (existsSync(path)) {
  const config = z.object({ vars: z.record(z.string(), z.unknown()).optional() }).passthrough().parse(JSON.parse(readFileSync(path, 'utf8')))
  config.vars ||= {}
  for (const key of ['NUXT_ADMIN_ENABLED', 'NUXT_PUBLIC_AUTH_ENABLED', 'NUXT_ASSISTANT_ENABLED']) delete config.vars[key]
  config.vars = { ...config.vars, NUXT_PUBLIC_GISCUS_REPO: process.env.NUXT_PUBLIC_GISCUS_REPO || 'setobox/mukuchi', NUXT_PUBLIC_GISCUS_REPO_ID: process.env.NUXT_PUBLIC_GISCUS_REPO_ID || '', NUXT_PUBLIC_GISCUS_CATEGORY_ID: process.env.NUXT_PUBLIC_GISCUS_CATEGORY_ID || '' }
  writeFileSync(path, JSON.stringify(config, null, 2))
}
console.log('admin 构建完成：资源绑定固定保留，功能由后台管理。')
