import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import process from 'node:process'
import { statsEnabled } from '../shared/stats/model.ts'
import { statsWranglerSchema } from '../shared/stats/release.ts'
import './stats-environment.ts'

const enabled = statsEnabled(process.env.NUXT_PUBLIC_STATS_ENABLED)
writeFileSync('.output/stats-build.json', JSON.stringify({ enabled }))
const configFile = '.output/server/wrangler.json'
if (existsSync(configFile)) {
  const config = statsWranglerSchema.parse(JSON.parse(readFileSync(configFile, 'utf8')))
  // Avoid provisioning an unused remote database on a stats-disabled release.
  if (!enabled)
    config.d1_databases = config.d1_databases.filter(binding => binding.binding !== 'STATS_DB')
  config.vars = { ...config.vars, NUXT_PUBLIC_STATS_ENABLED: String(enabled) }
  writeFileSync(configFile, JSON.stringify(config, null, 2))
}
console.log(`统计构建配置：${enabled ? '已启用' : '已关闭'}。`)
