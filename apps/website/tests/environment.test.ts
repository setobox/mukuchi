import type { WebsiteEnvironmentConfig } from '../shared/config/environment'
import { expect, test } from 'vite-plus/test'
import { productionOidcClient } from '../config/oidc-client.production'
import { missingAudioResources } from '../server/features/audio/cloudflare'
import { publicEnvironmentDefaults, readPublicEnvironment, resolveWebsiteEnvironment } from '../shared/config/environment'
import { cloudflareSiteRoutes } from '../shared/site/cloudflare'
import { pageUrl } from '../shared/site/url'

const defaults: WebsiteEnvironmentConfig = {
  adminAssetsDirectory: '/data/assets',
  adminDatabasePath: '/data/admin.sqlite',
  adminImagesDirectory: '/images',
  adminPostsDirectory: '/posts',
  aiEncryptionKey: '',
  appOrigin: '',
  audioSyncToken: '',
  authAdminEmails: '',
  authSessionKey: '',
  authSessionMaxAge: 28800,
  githubBranch: 'main',
  githubPublishToken: '',
  githubRepository: 'setobox/mukuchi',
  oidcClientId: '',
  oidcClientSecret: '',
  oidcIssuer: 'https://id.seto.box/api/auth',
  oidcPostLogoutRedirectUri: '',
  oidcRedirectUri: '',
  oidcScopes: 'openid profile email',
  statsAdminToken: '',
  statsDatabasePath: '/data/stats.sqlite',
  statsHashSecret: '',
  public: publicEnvironmentDefaults,
}

test('缺省配置保留本机登录和框架字段，忽略旧名称与 Windows PUBLIC', () => {
  const config = { ...defaults, app: { baseURL: '/blog/' }, adminLocalProof: 'local-proof' }
  const resolved = resolveWebsiteEnvironment(config, { NUXT_OIDC_CLIENT_ID: 'old-client', PUBLIC: 'C:\\Users\\Public', PATH: 'system' })
  expect(resolved).toEqual(config)
  expect(resolved).not.toBe(config)
  expect(resolved.public).not.toBe(config.public)
  expect(resolved.oidcClientId).toBe('')
})

test('新变量覆盖字段，保留密钥字符、转换会话秒数，不污染原配置', () => {
  const resolved = resolveWebsiteEnvironment(defaults, {
    ADMIN_DATABASE_PATH: 'D:\\private\\admin.sqlite',
    AI_ENCRYPTION_KEY: 'opaque+/key=',
    APP_ORIGIN: 'https://blog.test',
    AUDIO_SYNC_TOKEN: 'sync-token',
    AUTH_ADMIN_EMAILS: 'admin@example.invalid',
    AUTH_SESSION_KEY: 'session-key',
    AUTH_SESSION_MAX_AGE: '3600',
    GITHUB_PUBLISH_TOKEN: 'publish-token',
    OIDC_CLIENT_ID: 'mukuchi-test',
    OIDC_CLIENT_SECRET: 'oidc-secret',
    STATS_HASH_SECRET: 'stats-secret',
    PUBLIC_GISCUS_REPO: 'owner/comments',
  })
  expect(resolved).toMatchObject({ adminDatabasePath: 'D:\\private\\admin.sqlite', aiEncryptionKey: 'opaque+/key=', appOrigin: 'https://blog.test', audioSyncToken: 'sync-token', authAdminEmails: 'admin@example.invalid', authSessionKey: 'session-key', authSessionMaxAge: 3600, githubPublishToken: 'publish-token', oidcClientId: 'mukuchi-test', oidcClientSecret: 'oidc-secret', statsHashSecret: 'stats-secret', public: { giscusRepo: 'owner/comments' } })
  expect(defaults.aiEncryptionKey).toBe('')
  expect(defaults.public.giscusRepo).toBe('setobox/mukuchi')
})

test('Workers 绑定优先，空值不回退，不同请求不共享密钥', () => {
  const environment = { OIDC_CLIENT_SECRET: 'node-secret', AI_ENCRYPTION_KEY: 'node-key' }
  const first = resolveWebsiteEnvironment(defaults, environment, { OIDC_CLIENT_SECRET: '', AI_ENCRYPTION_KEY: 'worker-key' })
  const second = resolveWebsiteEnvironment(defaults, environment, { AI_ENCRYPTION_KEY: 'another-key' })
  expect(first.oidcClientSecret).toBe('')
  expect(first.aiEncryptionKey).toBe('worker-key')
  expect(second.oidcClientSecret).toBe('node-secret')
  expect(second.aiEncryptionKey).toBe('another-key')
  expect(environment.AI_ENCRYPTION_KEY).toBe('node-key')
})

test('构建和预渲染只读取公开白名单，私有输入不进入 public', () => {
  const environment = { PUBLIC: 'C:\\Users\\Public', PUBLIC_SITE_URL: 'https://public.test', PUBLIC_GISCUS_REPO_ID: 'repo-id', PUBLIC_OIDC_CLIENT_SECRET: 'never-public', OIDC_CLIENT_SECRET: 'private', AI_ENCRYPTION_KEY: { invalid: true } }
  const config = resolveWebsiteEnvironment(defaults, environment, {}, true)
  expect(config.public).toEqual(readPublicEnvironment(environment))
  expect(config.public.siteUrl).toBe('https://public.test')
  expect(config.oidcClientSecret).toBe('')
  expect(config.aiEncryptionKey).toBe('')
  expect(JSON.stringify(config.public)).not.toMatch(/private|never-public|invalid/)
})

test.each(['', '299', '604801', '3.5', 'invalid', 'Infinity'])('拒绝无效会话有效期 %j', (value) => {
  expect(() => resolveWebsiteEnvironment(defaults, { AUTH_SESSION_MAX_AGE: value })).toThrow('AUTH_SESSION_MAX_AGE')
})

test('拒绝不可信绑定类型，错误不包含密钥值', () => {
  expect(() => resolveWebsiteEnvironment(defaults, {}, { AI_ENCRYPTION_KEY: { secret: 'do-not-log' } })).toThrow('AI_ENCRYPTION_KEY 必须是字符串')
})

test('音频工作流资源检查使用新密钥名称', () => {
  expect(missingAudioResources({ AI_ENCRYPTION_KEY: 'worker-key' })).toEqual(['ADMIN_DB', 'AUDIO_ASSETS', 'ARTICLE_AUDIO_WORKFLOW'])
  expect(missingAudioResources({})).toContain('AI_ENCRYPTION_KEY')
})

test.each(['https://blog.example.com', 'https://journal.example.net/'])('自定义站点 %s 同时用于正式链接和部署路由', (siteUrl) => {
  const config = readPublicEnvironment({ PUBLIC_SITE_URL: siteUrl })
  const site = new URL(siteUrl)
  expect(config.siteUrl).toBe(site.origin)
  expect(pageUrl(config.siteUrl, '/', '/posts/example')).toBe(`${site.origin}/posts/example`)
  expect(cloudflareSiteRoutes(config.siteUrl)).toEqual([{ pattern: site.hostname, custom_domain: true }])
  expect(productionOidcClient(config.siteUrl)).toMatchObject({
    redirectUris: [`${site.origin}/api/auth/sso/callback`],
    postLogoutRedirectUris: [`${site.origin}/`],
  })
  const runtime = resolveWebsiteEnvironment(defaults, { PUBLIC_SITE_URL: 'https://build.example.com' }, { PUBLIC_SITE_URL: siteUrl })
  expect(runtime.public.siteUrl).toBe(config.siteUrl)
  expect(publicEnvironmentDefaults.siteUrl).not.toBe(config.siteUrl)
})

test.each(['', 'invalid', 'javascript:alert(1)', 'https://user:password@example.com', 'https://example.com/blog', 'https://example.com/?q=1', 'https://example.com/#hash'])('在配置入口拒绝无效站点地址 %j', (siteUrl) => {
  expect(() => readPublicEnvironment({ PUBLIC_SITE_URL: siteUrl })).toThrow('PUBLIC_SITE_URL')
  expect(() => resolveWebsiteEnvironment(defaults, {}, { PUBLIC_SITE_URL: siteUrl })).toThrow('PUBLIC_SITE_URL')
})

test('本地允许 HTTP 和端口，Cloudflare 自定义域名拒绝这两种配置', () => {
  expect(readPublicEnvironment({ PUBLIC_SITE_URL: 'http://localhost:3333/' }).siteUrl).toBe('http://localhost:3333')
  for (const siteUrl of ['http://example.com', 'https://example.com:3333'])
    expect(() => cloudflareSiteRoutes(siteUrl)).toThrow('Cloudflare')
})
