/** Only named leaf values are read; Windows' PUBLIC must never replace config.public. */
export type Environment = Readonly<Record<string, unknown>>

const publicVariables = {
  giscusCategoryId: 'PUBLIC_GISCUS_CATEGORY_ID',
  giscusRepo: 'PUBLIC_GISCUS_REPO',
  giscusRepoId: 'PUBLIC_GISCUS_REPO_ID',
  siteUrl: 'PUBLIC_SITE_URL',
} as const

const privateVariables = {
  adminAssetsDirectory: 'ADMIN_ASSETS_DIRECTORY',
  adminDatabasePath: 'ADMIN_DATABASE_PATH',
  adminImagesDirectory: 'ADMIN_IMAGES_DIRECTORY',
  adminPostsDirectory: 'ADMIN_POSTS_DIRECTORY',
  aiEncryptionKey: 'AI_ENCRYPTION_KEY',
  appOrigin: 'APP_ORIGIN',
  audioSyncToken: 'AUDIO_SYNC_TOKEN',
  authAdminEmails: 'AUTH_ADMIN_EMAILS',
  authSessionKey: 'AUTH_SESSION_KEY',
  githubBranch: 'GITHUB_BRANCH',
  githubPublishToken: 'GITHUB_PUBLISH_TOKEN',
  githubRepository: 'GITHUB_REPOSITORY',
  oidcClientId: 'OIDC_CLIENT_ID',
  oidcClientSecret: 'OIDC_CLIENT_SECRET',
  oidcIssuer: 'OIDC_ISSUER',
  oidcPostLogoutRedirectUri: 'OIDC_POST_LOGOUT_REDIRECT_URI',
  oidcRedirectUri: 'OIDC_REDIRECT_URI',
  oidcScopes: 'OIDC_SCOPES',
  statsAdminToken: 'STATS_ADMIN_TOKEN',
  statsDatabasePath: 'STATS_DATABASE_PATH',
  statsHashSecret: 'STATS_HASH_SECRET',
} as const

export type PublicEnvironmentConfig = Record<keyof typeof publicVariables, string>
export type WebsiteEnvironmentConfig = Record<keyof typeof privateVariables, string> & {
  authSessionMaxAge: number
  public: PublicEnvironmentConfig
}

export const publicEnvironmentDefaults: PublicEnvironmentConfig = {
  giscusCategoryId: '',
  giscusRepo: 'setobox/mukuchi',
  giscusRepoId: '',
  siteUrl: 'https://blog.seto.box',
}

function environmentString(name: string, environment: Environment, bindings: Environment): string | undefined {
  const value = bindings[name] ?? environment[name]
  if (value === undefined)
    return undefined
  if (typeof value !== 'string')
    throw new TypeError(`环境变量 ${name} 必须是字符串`)
  return value
}

export function readPublicEnvironment(environment: Environment, defaults = publicEnvironmentDefaults, bindings: Environment = {}): PublicEnvironmentConfig {
  const config = { ...defaults }
  for (const key of Object.keys(publicVariables) as (keyof typeof publicVariables)[]) {
    config[key] = environmentString(publicVariables[key], environment, bindings) ?? defaults[key]
  }
  return config
}

/** Keep unrelated framework config intact and never mutate process.env or shared defaults. */
export function resolveWebsiteEnvironment<T extends WebsiteEnvironmentConfig>(defaults: T, environment: Environment, bindings: Environment = {}, publicOnly = false): T {
  const config = { ...defaults, public: { ...defaults.public, ...readPublicEnvironment(environment, defaults.public, bindings) } }
  if (publicOnly)
    return config
  for (const key of Object.keys(privateVariables) as (keyof typeof privateVariables)[]) {
    config[key] = environmentString(privateVariables[key], environment, bindings) ?? defaults[key]
  }
  const maxAge = environmentString('AUTH_SESSION_MAX_AGE', environment, bindings)
  if (maxAge !== undefined) {
    const seconds = Number(maxAge)
    if (!Number.isInteger(seconds) || seconds < 300 || seconds > 604800)
      throw new TypeError('环境变量 AUTH_SESSION_MAX_AGE 必须为 300–604800 的整数秒数')
    config.authSessionMaxAge = seconds
  }
  return config
}
