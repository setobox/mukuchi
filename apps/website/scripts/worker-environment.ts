import { z } from 'zod'

export const workerSecrets = ['AI_ENCRYPTION_KEY', 'AUDIO_SYNC_TOKEN', 'AUTH_SESSION_KEY', 'GITHUB_PUBLISH_TOKEN', 'OIDC_CLIENT_SECRET', 'STATS_ADMIN_TOKEN', 'STATS_HASH_SECRET'] as const
export const workerVariables = ['APP_ORIGIN', 'AUTH_ADMIN_EMAILS', 'AUTH_SESSION_MAX_AGE', 'OIDC_CLIENT_ID', 'OIDC_ISSUER', 'OIDC_POST_LOGOUT_REDIRECT_URI', 'OIDC_REDIRECT_URI', 'OIDC_SCOPES'] as const

export function validateWorkerEnvironment(input: unknown): void {
  const parsed = z.object({ bindings: z.array(z.object({ name: z.string(), type: z.string(), text: z.string().optional() })) }).safeParse(input)
  if (!parsed.success)
    throw new Error('Worker 配置响应格式无效；详情已隐藏。')
  const bindings = parsed.data.bindings
  if (new Set(bindings.map(item => item.name)).size !== bindings.length)
    throw new Error('Worker 绑定名称重复。')
  for (const name of workerSecrets) {
    if (!bindings.some(item => item.name === name && item.type === 'secret_text'))
      throw new Error(`缺少 Worker Secret：${name}`)
  }
  for (const name of workerVariables) {
    const item = bindings.find(item => item.name === name)
    // These two values have validated runtime defaults.
    if (!item && (name === 'AUTH_SESSION_MAX_AGE' || name === 'OIDC_SCOPES'))
      continue
    if (!item || (item.type !== 'secret_text' && (item.type !== 'plain_text' || !item.text?.trim())))
      throw new Error(`缺少 Worker 配置：${name}`)
  }
}

export async function readWorkerEnvironment(account: string, worker: string, token: string, request: typeof fetch = fetch): Promise<unknown> {
  if (!/^[a-f0-9]{32}$/i.test(account) || !/^[\w-]+$/.test(worker) || !token)
    throw new Error('Worker 配置检查需要有效的账户、Worker 名称和 CLOUDFLARE_API_TOKEN。')
  let response: Response
  try {
    response = await request(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${worker}/settings`, {
      headers: { Authorization: `Bearer ${token}` },
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    })
  }
  catch { throw new Error('无法读取 Worker 配置；请检查网络和部署权限。') }
  const parsed = z.object({ success: z.literal(true), result: z.unknown() }).safeParse(await response.json().catch(() => undefined))
  if (!response.ok || !parsed.success)
    throw new Error(`Worker 配置读取失败（HTTP ${response.status}）；响应内容已隐藏。`)
  return parsed.data.result
}
