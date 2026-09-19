import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import process from 'node:process'
import { z } from 'zod'
import './stats-environment.ts'

const enabled = process.env.NUXT_AUDIO_ENABLED === 'true'
writeFileSync('.output/audio-build.json', JSON.stringify({ enabled }))
if (enabled && process.env.NUXT_ADMIN_ENABLED !== 'true')
  throw new Error('启用音频执行环境前必须启用站主后台')
const path = '.output/server/wrangler.json'
if (existsSync(path)) {
  const config = z.object({ r2_buckets: z.array(z.object({ binding: z.string() }).passthrough()).optional(), workflows: z.array(z.object({ binding: z.string() }).passthrough()).optional(), triggers: z.object({ crons: z.array(z.string()) }).optional(), vars: z.record(z.string(), z.unknown()).optional() }).passthrough().parse(JSON.parse(readFileSync(path, 'utf8')))
  if (!enabled) {
    config.r2_buckets = config.r2_buckets?.filter(bucket => bucket.binding !== 'AUDIO_ASSETS')
    config.workflows = config.workflows?.filter(workflow => workflow.binding !== 'ARTICLE_AUDIO_WORKFLOW')
    if (config.triggers)
      config.triggers.crons = config.triggers.crons.filter(cron => cron !== '*/5 * * * *')
  }
  config.vars = { ...config.vars, NUXT_AUDIO_ENABLED: String(enabled), NUXT_PUBLIC_AUDIO_ENABLED: String(enabled) }
  writeFileSync(path, JSON.stringify(config, null, 2))
}
console.log(`音频构建配置：${enabled ? '已启用' : '已关闭'}。`)
