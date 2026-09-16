import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { z } from 'zod'
import { statsBuildSchema, statsWranglerSchema, validateStatsBinding, validateStatsRelease } from '../shared/stats/release.ts'

const build = statsBuildSchema.parse(JSON.parse(readFileSync('.output/stats-build.json', 'utf8')))
if (build.enabled) {
  const configPath = '.output/server/wrangler.json'
  const config = statsWranglerSchema.parse(JSON.parse(readFileSync(configPath, 'utf8')))
  const statsId = config.d1_databases.find(binding => binding.binding === 'STATS_DB')?.database_id
  const contentId = config.d1_databases.find(binding => binding.binding === 'DB')?.database_id
  // Validate IDs before any remote request; secret values are never returned.
  validateStatsBinding({ statsId, contentId })
  const require = createRequire(import.meta.url)
  const wrangler = join(dirname(require.resolve('wrangler/package.json')), 'bin/wrangler.js')
  const output = execFileSync(process.execPath, [wrangler, 'secret', 'list', '--format', 'json', '--config', configPath], { encoding: 'utf8', windowsHide: true })
  const names = z.array(z.object({ name: z.string() })).parse(JSON.parse(output))
  validateStatsRelease({ enabled: true, statsId, contentId, secretNames: names.map(secret => secret.name) })
  execFileSync(process.execPath, [wrangler, 'd1', 'migrations', 'apply', 'mukuchi-stats', '--remote', '--config', 'wrangler.jsonc'], { stdio: 'inherit', windowsHide: true })
}
console.log('统计发布前置检查完成。')
