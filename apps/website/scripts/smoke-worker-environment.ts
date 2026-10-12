import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { unstable_dev } from 'wrangler'

// Only local, disposable bindings. No production credentials or audio jobs.
const bindings = {
  APP_ORIGIN: 'https://blog.test',
  OIDC_ISSUER: 'https://id.test/api/auth',
  OIDC_CLIENT_ID: 'mukuchi-test',
  OIDC_CLIENT_SECRET: randomBytes(32).toString('hex'),
  OIDC_REDIRECT_URI: 'https://blog.test/api/auth/sso/callback',
  OIDC_POST_LOGOUT_REDIRECT_URI: 'https://blog.test/',
  OIDC_SCOPES: 'openid profile email',
  AUTH_SESSION_KEY: randomBytes(32).toString('base64'),
  AUTH_SESSION_MAX_AGE: '28800',
  AI_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  AUDIO_SYNC_TOKEN: randomBytes(32).toString('hex'),
  PUBLIC: 'C:\\Users\\Public',
  PUBLIC_GISCUS_REPO: 'worker-environment-smoke/comments',
}
for (const configured of [false, true]) {
  const worker = await unstable_dev('.output/server/index.mjs', {
    config: '.output/server/wrangler.json',
    local: true,
    persist: false,
    ip: '127.0.0.1',
    port: 0,
    inspectorPort: 0,
    logLevel: 'error',
    vars: { ...bindings, OIDC_CLIENT_SECRET: configured ? bindings.OIDC_CLIENT_SECRET : '' },
    experimental: { disableExperimentalWarning: true, disableDevRegistry: true, watch: false },
  })
  try {
    const session = await worker.fetch('/api/auth/session')
    if (!configured) {
      assert.equal(session.status, 503, 'Worker 缺少登录配置必须拒绝请求')
      continue
    }
    assert.equal(session.status, 200)
    const account = await session.json() as { ssoAvailable: boolean, localAvailable: boolean }
    assert.equal(account.ssoAvailable, true, '请求绑定必须在认证校验前注入')
    assert.equal(account.localAvailable, false)
    assert.equal((await worker.fetch('/api/admin/articles')).status, 401)
    const page = await worker.fetch('/admin')
    assert.equal(page.status, 200)
    const html = await page.text()
    assert.ok(html.includes(bindings.PUBLIC_GISCUS_REPO), 'Worker SSR 必须读取公开绑定')
    for (const secret of [bindings.OIDC_CLIENT_SECRET, bindings.AUTH_SESSION_KEY, bindings.AI_ENCRYPTION_KEY, bindings.AUDIO_SYNC_TOKEN])
      assert.ok(!html.includes(secret), 'Worker SSR 不得包含私有配置')
    for (const [credential, status] of [['incorrect', 401], [bindings.AUDIO_SYNC_TOKEN, 409]] as const) {
      const response = await worker.fetch('/api/internal/audio/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'authorization': `Bearer ${credential}` },
        body: JSON.stringify({ revision: 'environment-smoke-not-a-deployment' }),
      })
      assert.equal(response.status, status, '音频同步使用请求绑定，版本不匹配时不得调度任务')
    }
  }
  finally { await worker.stop() }
}
console.log('Worker 本地请求验收通过：缺失配置、认证顺序、公开绑定、密钥隔离和音频同步鉴权（未调度任务）。')
