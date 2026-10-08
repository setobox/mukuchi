import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vite-plus/test'

test('产物检查允许已公开的联系邮箱，仍拒绝私有管理员邮箱和密钥', () => {
  const directory = mkdtempSync(join(tmpdir(), 'admin-build-secrets-'))
  const script = fileURLToPath(new URL('../scripts/check-admin-build.ts', import.meta.url))
  try {
    mkdirSync(join(directory, '.output/public'), { recursive: true })
    mkdirSync(join(directory, 'app/pages'), { recursive: true })
    writeFileSync(join(directory, 'app/pages/privacy.vue'), '<a href="mailto:public@example.com">Contact</a>')
    const run = (content: string) => {
      writeFileSync(join(directory, '.output/public/index.html'), content)
      return spawnSync(process.execPath, [script], { cwd: directory, windowsHide: true, env: { ...process.env, NUXT_ADMIN_DATABASE_PATH: 'absent.sqlite', NUXT_AUTH_ADMIN_EMAILS: 'public@example.com,private@example.com', NUXT_OIDC_CLIENT_SECRET: 'oidc-secret-fixture', NUXT_AUTH_SESSION_KEY: 'session-key-fixture', NUXT_AUTH_SECRET: 'server-secret-fixture' } }).status
    }
    expect(run('public@example.com')).toBe(0)
    expect(run('private@example.com')).not.toBe(0)
    expect(run('server-secret-fixture')).not.toBe(0)
    expect(run('oidc-secret-fixture')).not.toBe(0)
    expect(run('session-key-fixture')).not.toBe(0)
  }
  finally { rmSync(directory, { recursive: true, force: true }) }
})
