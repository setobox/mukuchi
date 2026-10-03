import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { z } from 'zod'
import './stats-environment.ts'

writeFileSync('.output/stats-build.json', JSON.stringify({ available: true }))
const path = '.output/server/wrangler.json'
if (existsSync(path)) {
  const config = z.object({ vars: z.record(z.string(), z.unknown()).optional() }).passthrough().parse(JSON.parse(readFileSync(path, 'utf8')))
  config.vars ||= {}
  for (const key of ['NUXT_PUBLIC_STATS_ENABLED']) delete config.vars[key]
  writeFileSync(path, JSON.stringify(config, null, 2))
}
console.log('stats 构建完成：资源绑定固定保留，功能由后台管理。')
