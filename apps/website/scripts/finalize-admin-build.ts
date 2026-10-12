import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import process from 'node:process'
import { z } from 'zod'
import { readPublicEnvironment } from '../shared/config/environment.ts'
import './stats-environment.ts'

writeFileSync('.output/admin-build.json', JSON.stringify({ available: true }))
const path = '.output/server/wrangler.json'
if (existsSync(path)) {
  const config = z.object({ vars: z.record(z.string(), z.unknown()).optional() }).passthrough().parse(JSON.parse(readFileSync(path, 'utf8')))
  config.vars ||= {}
  // Dashboard variables are removed explicitly after cutover acceptance, never by deploy.
  config.keep_vars = true
  for (const key of ['NUXT_ADMIN_ENABLED', 'NUXT_PUBLIC_AUTH_ENABLED', 'NUXT_ASSISTANT_ENABLED']) delete config.vars[key]
  const publicConfig = readPublicEnvironment(process.env)
  config.vars = { ...config.vars, PUBLIC_SITE_URL: publicConfig.siteUrl, PUBLIC_GISCUS_REPO: publicConfig.giscusRepo, PUBLIC_GISCUS_REPO_ID: publicConfig.giscusRepoId, PUBLIC_GISCUS_CATEGORY_ID: publicConfig.giscusCategoryId }
  writeFileSync(path, JSON.stringify(config, null, 2))
}
console.log('admin 构建完成：资源绑定固定保留，功能由后台管理。')
