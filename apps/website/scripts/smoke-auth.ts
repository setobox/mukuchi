import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { mkdtempSync, readdirSync, readFileSync, rmdirSync, unlinkSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { DatabaseSync } from 'node:sqlite'
import { setTimeout } from 'node:timers/promises'

// Tests the built Node server with an isolated database and synthetic credentials.
// It never contacts an identity provider or writes to the application's database.
const directory = mkdtempSync(join(tmpdir(), 'mukuchi-oidc-smoke-'))
const filename = join(directory, 'admin.sqlite')
const db = new DatabaseSync(filename)
for (const migration of readdirSync('migrations/admin').filter(name => name.endsWith('.sql')).sort())
  db.exec(readFileSync(join('migrations/admin', migration), 'utf8'))
const user = randomUUID()
const token = randomUUID()
const csrf = randomUUID()
db.prepare('INSERT INTO auth_users (id,email,name,avatar,created_at,updated_at) VALUES (?,?,?,?,?,?)').run(user, 'oidc-smoke@example.invalid', 'OIDC smoke', '', Date.now(), Date.now())
db.prepare('INSERT INTO auth_sessions (token_hash,user_id,local,csrf,expires_at) VALUES (?,?,?,?,?)').run(createHash('sha256').update(token).digest('hex'), user, 0, csrf, Date.now() + 300000)
db.close()
const listener = createServer()
await new Promise<void>(resolve => listener.listen(0, '127.0.0.1', resolve))
const address = listener.address()
assert(address && typeof address === 'object')
const port = address.port
await new Promise<void>(resolve => listener.close(() => resolve()))
const env = {
  ...process.env,
  HOST: '127.0.0.1',
  PORT: String(port),
  NUXT_ADMIN_DATABASE_PATH: filename,
  NUXT_APP_ORIGIN: 'https://blog.test',
  NUXT_OIDC_ISSUER: 'https://id.test/api/auth',
  NUXT_OIDC_CLIENT_ID: 'mukuchi-test',
  NUXT_OIDC_CLIENT_SECRET: randomBytes(32).toString('hex'),
  NUXT_OIDC_REDIRECT_URI: 'https://blog.test/api/auth/sso/callback',
  NUXT_OIDC_POST_LOGOUT_REDIRECT_URI: 'https://blog.test',
  NUXT_OIDC_SCOPES: 'openid profile email',
  NUXT_AUTH_SESSION_KEY: randomBytes(32).toString('base64'),
  NUXT_AUTH_SESSION_MAX_AGE: '28800',
  NUXT_AUTH_ADMIN_EMAILS: 'oidc-smoke@example.invalid',
}
const invalid = spawn(process.execPath, ['.output/server/index.mjs'], { env: { ...env, NUXT_OIDC_CLIENT_SECRET: '' }, windowsHide: true, stdio: 'pipe' })
let diagnostic = ''
invalid.stdout.on('data', () => {})
invalid.stderr.on('data', chunk => diagnostic += String(chunk))
const invalidExit = await new Promise<number | null>((resolve) => {
  const timeout = globalThis.setTimeout(() => invalid.kill(), 15000)
  invalid.once('exit', (code) => {
    clearTimeout(timeout)
    resolve(code)
  })
})
assert(typeof invalidExit === 'number' && invalidExit !== 0 && diagnostic.includes('OIDC 服务端配置'), '缺少密钥时生产服务器必须拒绝启动')
const server = spawn(process.execPath, ['.output/server/index.mjs'], { env, windowsHide: true, stdio: 'pipe' })
server.stdout.on('data', () => {})
server.stderr.on('data', () => {})
const stopped = new Promise<void>(resolve => server.once('exit', () => resolve()))
const base = `http://127.0.0.1:${port}`
const cookie = `mukuchi:session:v2=${token}`
const request = (path: string, headers: Record<string, string> = {}, method = 'GET') => fetch(`${base}${path}`, { method, headers, redirect: 'manual', signal: AbortSignal.timeout(10000) })
try {
  let ready = false
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      if ((await request('/api/auth/me')).ok) {
        ready = true
        break
      }
    }
    catch { /* Wait only for this child server. */ }
    await setTimeout(100)
  }
  assert(ready, '隔离服务器启动失败')
  const me = await request('/api/auth/me', { cookie })
  const info = await me.json() as { user: { id: string }, ssoAvailable: boolean, localAvailable: boolean }
  assert.equal(info.user.id, user)
  assert.equal(info.ssoAvailable, true)
  assert.equal(info.localAvailable, false)
  assert.match(me.headers.get('cache-control') ?? '', /no-store/)
  assert.equal((await request('/api/auth/local', { 'origin': env.NUXT_APP_ORIGIN, 'x-admin-request': '1' }, 'POST')).status, 403)
  const callback = await request('/api/auth/sso/callback?state=invalid&code=invalid')
  assert.equal(callback.status, 302)
  assert.match(callback.headers.get('location') ?? '', /auth_error=expired/)
  assert.equal((await request('/api/auth/logout', { cookie, 'origin': 'https://evil.test', 'x-csrf-token': csrf }, 'POST')).status, 403)
  assert.equal((await request('/api/auth/logout', { cookie, 'origin': env.NUXT_APP_ORIGIN, 'x-csrf-token': 'wrong' }, 'POST')).status, 403)
  assert.equal((await request('/api/auth/logout', { cookie, 'origin': env.NUXT_APP_ORIGIN, 'x-csrf-token': csrf }, 'POST')).status, 200)
  assert.equal((await (await request('/api/auth/me', { cookie })).json() as { user: unknown }).user, null)
  console.log('OIDC Node HTTP 验收通过：配置拒绝启动、会话接口、回调失败、生产禁用本地登录、CSRF 与退出。')
}
finally {
  server.kill()
  await stopped
  unlinkSync(filename)
  rmdirSync(directory)
}
