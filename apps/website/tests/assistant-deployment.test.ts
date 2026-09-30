import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vite-plus/test'

test('仅开放助手时保留 ADMIN_DB 并移除后台资产绑定，全部关闭时移除数据库绑定', () => {
  const directory = mkdtempSync(join(tmpdir(), 'assistant-build-test-'))
  try {
    mkdirSync(join(directory, '.output/server'), { recursive: true })
    const configPath = join(directory, '.output/server/wrangler.json')
    for (const assistantEnabled of [true, false]) {
      writeFileSync(configPath, JSON.stringify({ d1_databases: [{ binding: 'ADMIN_DB' }, { binding: 'CONTENT_DB' }], r2_buckets: [{ binding: 'ADMIN_ASSETS' }], vars: {} }))
      execFileSync(process.execPath, [fileURLToPath(new URL('../scripts/finalize-admin-build.ts', import.meta.url))], { cwd: directory, windowsHide: true, env: { ...process.env, NUXT_ADMIN_ENABLED: 'false', NUXT_PUBLIC_AUTH_ENABLED: 'false', NUXT_ASSISTANT_ENABLED: String(assistantEnabled) } })
      const config: { d1_databases: { binding: string }[], r2_buckets: { binding: string }[], vars: Record<string, string> } = JSON.parse(readFileSync(configPath, 'utf8'))
      expect(config.d1_databases.some(db => db.binding === 'ADMIN_DB')).toBe(assistantEnabled)
      expect(config.d1_databases.some(db => db.binding === 'CONTENT_DB')).toBe(true)
      expect(config.r2_buckets).toEqual([])
      expect(config.vars.NUXT_ASSISTANT_ENABLED).toBe(String(assistantEnabled))
    }
  }
  finally { rmSync(directory, { recursive: true, force: true }) }
})
