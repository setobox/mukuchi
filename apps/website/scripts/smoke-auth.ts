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
  ADMIN_DATABASE_PATH: filename,
  APP_ORIGIN: 'https://blog.test',
  OIDC_ISSUER: 'https://id.test/api/auth',
  OIDC_CLIENT_ID: 'mukuchi-test',
  OIDC_CLIENT_SECRET: randomBytes(32).toString('hex'),
  OIDC_REDIRECT_URI: 'https://blog.test/api/auth/sso/callback',
  OIDC_POST_LOGOUT_REDIRECT_URI: 'https://blog.test',
  OIDC_SCOPES: 'openid profile email',
  AUTH_SESSION_KEY: randomBytes(32).toString('base64'),
  AUTH_SESSION_MAX_AGE: '28800',
  AUTH_ADMIN_EMAILS: 'oidc-smoke@example.invalid',
  AI_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  AUDIO_SYNC_TOKEN: randomBytes(32).toString('hex'),
  PUBLIC: 'C:\\Users\\Public',
  PUBLIC_GISCUS_REPO: 'environment-smoke/comments',
}
const invalid = spawn(process.execPath, ['.output/server/index.mjs'], { env: { ...env, OIDC_CLIENT_SECRET: '' }, windowsHide: true, stdio: 'pipe' })
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
  const html = await (await request('/admin')).text()
  assert.ok(html.includes(env.PUBLIC_GISCUS_REPO), 'SSR 必须读取新名称的公开配置')
  for (const secret of [env.OIDC_CLIENT_SECRET, env.AUTH_SESSION_KEY, env.AI_ENCRYPTION_KEY, env.AUDIO_SYNC_TOKEN])
    assert.ok(!html.includes(secret), 'SSR 不得暴露私有配置')
  assert.equal((await request('/api/admin/articles')).status, 401)
  for (const [credential, status] of [['incorrect', 401], [env.AUDIO_SYNC_TOKEN, 409]] as const) {
    const response = await fetch(`${base}/api/internal/audio/sync`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'authorization': `Bearer ${credential}` },
      body: JSON.stringify({ revision: 'environment-smoke-not-a-deployment' }),
      signal: AbortSignal.timeout(10000),
    })
    assert.equal(response.status, status, '音频同步必须读取新令牌；版本不匹配时在调度任务前退出')
  }
  assert.equal((await request('/api/auth/local', { 'origin': env.APP_ORIGIN, 'x-admin-request': '1' }, 'POST')).status, 403)
  const callback = await request('/api/auth/sso/callback?state=invalid&code=invalid')
  assert.equal(callback.status, 302)
  assert.match(callback.headers.get('location') ?? '', /auth_error=expired/)
  assert.equal((await request('/api/auth/logout', { cookie, 'origin': 'https://evil.test', 'x-csrf-token': csrf }, 'POST')).status, 403)
  assert.equal((await request('/api/auth/logout', { cookie, 'origin': env.APP_ORIGIN, 'x-csrf-token': 'wrong' }, 'POST')).status, 403)
  assert.equal((await request('/api/auth/logout', { cookie, 'origin': env.APP_ORIGIN, 'x-csrf-token': csrf }, 'POST')).status, 200)
  assert.equal((await (await request('/api/auth/me', { cookie })).json() as { user: unknown }).user, null)
  console.log('Node HTTP 验收通过：配置拒绝启动、登录会话与权限、公开配置与密钥隔离、Windows PUBLIC、音频同步鉴权（未调度任务）、CSRF 与退出。')
}
finally {
  server.kill()
  await stopped
  unlinkSync(filename)
  rmdirSync(directory)
}
