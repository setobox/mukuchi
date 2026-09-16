import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { statsBuildSchema, statsWranglerSchema } from '../shared/stats/release.ts'
import './stats-environment.ts'

const build = statsBuildSchema.parse(JSON.parse(readFileSync('.output/stats-build.json', 'utf8')))
function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)])
}
const secrets = [process.env.NUXT_STATS_HASH_SECRET, process.env.NUXT_STATS_ADMIN_TOKEN].filter((value): value is string => !!value)
for (const filename of files('.output/public').filter(filename => /\.(?:html|json|js|mjs|map)$/.test(filename))) {
  const text = readFileSync(filename, 'utf8')
  for (const secret of secrets)
    assert.ok(!text.includes(secret), '公共产物不得包含统计密钥')
  if (filename.endsWith('.html')) {
    assert.ok(!/mukuchi:visitor=[\da-f-]{36}/i.test(text), 'HTML 不得携带访客 Cookie')
    if (build.enabled && /[\\/]posts[\\/]/.test(filename))
      assert.ok(text.includes('浏览 — 次'), '预渲染文章应保留访问数字占位')
  }
}
if (existsSync('.output/server/wrangler.json')) {
  const config = statsWranglerSchema.parse(JSON.parse(readFileSync('.output/server/wrangler.json', 'utf8')))
  assert.equal(config.d1_databases.some(binding => binding.binding === 'STATS_DB'), build.enabled)
  assert.equal(config.vars?.NUXT_PUBLIC_STATS_ENABLED, String(build.enabled))
  for (const filename of files('.output/server').filter(filename => filename.endsWith('.mjs'))) {
    const code = readFileSync(filename, 'utf8')
    // Nuxt Content retains a guarded getBuiltinModule probe for its prerender adapter.
    // Reject actual imports and the stats Node driver, not that existing lazy probe.
    assert.ok(!/(?:from\s*|import\s*(?:\(\s*)?|require\s*\(\s*)["']node:sqlite["']/.test(code), 'Workers 产物不得导入 Node SQLite')
    assert.ok(!code.includes('统计数据库不存在，请先执行迁移'), 'Workers 不能包含统计 Node 适配器')
  }
}
console.log('统计产物验收通过：预渲染占位、密钥隔离、Worker 绑定和适配器。')
