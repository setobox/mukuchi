import { Buffer } from 'node:buffer'
import { z } from 'zod'

export const target = {
  repository: 'setobox/mukuchi',
  worker: 'mukuchi-blog',
  account: 'a710076631754d4af44ad75f975c0c8d',
} as const

const workerSecrets = [
  'AI_ENCRYPTION_KEY',
  'APP_ORIGIN',
  'AUDIO_SYNC_TOKEN',
  'AUTH_ADMIN_EMAILS',
  'AUTH_SESSION_KEY',
  'AUTH_SESSION_MAX_AGE',
  'GITHUB_PUBLISH_TOKEN',
  'OIDC_CLIENT_ID',
  'OIDC_CLIENT_SECRET',
  'OIDC_ISSUER',
  'OIDC_POST_LOGOUT_REDIRECT_URI',
  'OIDC_REDIRECT_URI',
  'OIDC_SCOPES',
  'STATS_ADMIN_TOKEN',
  'STATS_HASH_SECRET',
] as const
const giscusNames = ['PUBLIC_GISCUS_CATEGORY_ID', 'PUBLIC_GISCUS_REPO', 'PUBLIC_GISCUS_REPO_ID'] as const
const githubShared = new Set(['AI_ENCRYPTION_KEY', 'AUDIO_SYNC_TOKEN'])
const workerSecretNames = new Set<string>(workerSecrets)
const allowed = new Set<string>([...workerSecrets, ...giscusNames, 'CLOUDFLARE_ACCOUNT_ID', 'MUKUCHI_SMOKE_URL'])

export class SyncError extends Error {}

export function decodeJson(text: string): unknown {
  try {
    return JSON.parse(text.replace(/^\uFEFF/, ''))
  }
  catch { throw new SyncError('JSON 格式不正确；错误详情已隐藏，避免泄露内容。') }
}

function checked<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success)
    throw new SyncError('平台响应格式不符合预期；已停止。')
  return result.data
}

interface Entry { name: string, value: string }
export interface SyncPlan {
  worker: (Entry & { type: 'plain_text' | 'secret_text' })[]
  githubSecrets: Entry[]
  githubVariables: Entry[]
}

export function createPlan(input: unknown): SyncPlan {
  const parsed = z.record(z.string(), z.string()).safeParse(input)
  if (!parsed.success || Object.keys(parsed.data).some(name => !allowed.has(name)))
    throw new SyncError('仅接受列出的项目新名称及字符串值；不能输入旧名称、路径、部署 Token 或自定义字段。')
  const values = parsed.data
  const plan: SyncPlan = { worker: [], githubSecrets: [], githubVariables: [] }
  for (const [name, value] of Object.entries(values).sort()) {
    if (value === '')
      continue
    if (value !== value.trim() || /[\r\n\0]/.test(value))
      throw new SyncError(`${name} 不允许首尾空白或换行。`)
    if (['AI_ENCRYPTION_KEY', 'AUTH_SESSION_KEY'].includes(name)
      && (!/^[A-Z0-9+/]{43}=$/i.test(value) || Buffer.from(value, 'base64').length !== 32)) {
      throw new SyncError(`${name} 必须为 32 字节 Base64。`)
    }
    if (['AUDIO_SYNC_TOKEN', 'STATS_HASH_SECRET'].includes(name) && value.length < 32)
      throw new SyncError(`${name} 至少需要 32 字符。`)
    if (name === 'AUTH_SESSION_MAX_AGE' && (!/^\d+$/.test(value) || Number(value) < 300 || Number(value) > 604800))
      throw new SyncError('AUTH_SESSION_MAX_AGE 必须为 300–604800 的整数。')
    if (name === 'OIDC_SCOPES' && value !== 'openid profile email')
      throw new SyncError('OIDC_SCOPES 必须为 openid profile email。')
    if (name === 'CLOUDFLARE_ACCOUNT_ID' && value !== target.account)
      throw new SyncError('CLOUDFLARE_ACCOUNT_ID 与本项目目标账户不一致。')
    if (['APP_ORIGIN', 'OIDC_ISSUER', 'OIDC_REDIRECT_URI', 'OIDC_POST_LOGOUT_REDIRECT_URI', 'MUKUCHI_SMOKE_URL'].includes(name)) {
      let url: URL
      try {
        url = new URL(value)
      }
      catch { throw new SyncError(`${name} 必须为 HTTPS 地址。`) }
      if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search)
        throw new SyncError(`${name} 必须为不含凭据、查询或片段的 HTTPS 地址。`)
    }
    const entry = { name, value }
    if (name.startsWith('PUBLIC_GISCUS_')) {
      plan.worker.push({ ...entry, type: 'plain_text' })
      plan.githubVariables.push({ name: name.replace('PUBLIC_', 'MUKUCHI_'), value })
    }
    else if (workerSecretNames.has(name)) {
      plan.worker.push({ ...entry, type: 'secret_text' })
      if (githubShared.has(name))
        plan.githubSecrets.push(entry)
    }
    else {
      plan.githubVariables.push(entry)
    }
  }
  if (giscusNames.some(name => values[name]) && !giscusNames.every(name => values[name]))
    throw new SyncError('Giscus 三项必须一起填写，避免仓库与分类不匹配。')
  return plan
}

export function preview(plan: SyncPlan): string[] {
  return [
    `目标：GitHub ${target.repository}；Cloudflare ${target.worker}`,
    ...plan.worker.map(item => `Cloudflare ${item.type === 'secret_text' ? 'Secret' : 'Variable'}: ${item.name}`),
    ...plan.githubSecrets.map(item => `GitHub Secret: ${item.name}`),
    ...plan.githubVariables.map(item => `GitHub Variable: ${item.name}`),
    '空值跳过；仅显示名称；不删除旧项。',
  ]
}

const settingsSchema = z.object({ bindings: z.array(z.object({ name: z.string(), type: z.string(), text: z.string().optional() })) })
type Settings = z.infer<typeof settingsSchema>
const namesSchema = z.array(z.object({ name: z.string() }))
const deploymentsSchema = z.object({ deployments: z.array(z.object({ id: z.string(), versions: z.array(z.object({ version_id: z.string(), percentage: z.number() })) })).min(1) })
const versionsSchema = z.object({ items: z.array(z.object({ id: z.string() })).min(1) })

export interface SyncAdapters {
  cloudflare: (path: string, body?: FormData) => Promise<unknown>
  github: (args: string[], input?: string) => Promise<string>
  log: (message: string) => void
}

async function deployedVersion(io: SyncAdapters): Promise<string> {
  const deployments = checked(deploymentsSchema, await io.cloudflare('/deployments')).deployments[0]!
  const latest = checked(versionsSchema, await io.cloudflare('/versions?per_page=1')).items[0]!
  if (deployments.versions.length !== 1 || deployments.versions[0]!.percentage !== 100 || deployments.versions[0]!.version_id !== latest.id)
    throw new SyncError('Worker 有未发布版本或正在分流；先完成该发布，再同步配置。')
  return `${deployments.id}/${latest.id}`
}

export async function applyPlan(plan: SyncPlan, io: SyncAdapters, replaceSecrets = false): Promise<void> {
  if (!plan.worker.length && !plan.githubSecrets.length && !plan.githubVariables.length)
    throw new SyncError('没有非空配置可写入。')
  // Read all destinations before any write. Never convert a Secret to a Variable.
  const githubSecrets = checked(namesSchema, decodeJson(await io.github(['secret', 'list', '--json', 'name'])))
  const githubVariables = checked(namesSchema, decodeJson(await io.github(['variable', 'list', '--json', 'name'])))
  for (const item of plan.githubSecrets) {
    if (githubVariables.some(existing => existing.name === item.name))
      throw new SyncError(`GitHub ${item.name} 已是 Variable，停止以保留类型。`)
    if (!replaceSecrets && githubSecrets.some(existing => existing.name === item.name))
      throw new SyncError(`GitHub Secret ${item.name} 已存在；确认原值后使用 --replace-secrets。`)
  }
  for (const item of plan.githubVariables) {
    if (githubSecrets.some(existing => existing.name === item.name))
      throw new SyncError(`GitHub ${item.name} 已是 Secret，停止以保留类型。`)
  }
  if (plan.worker.length) {
    const version = await deployedVersion(io)
    const before = checked(settingsSchema, await io.cloudflare('/settings'))
    if (new Set(before.bindings.map(item => item.name)).size !== before.bindings.length)
      throw new SyncError('Worker 绑定名称重复，已停止。')
    for (const item of plan.worker) {
      for (const name of [item.name, `NUXT_${item.name}`]) {
        const old = before.bindings.find(binding => binding.name === name)
        if (old && old.type !== item.type)
          throw new SyncError(`Cloudflare ${item.name} 类型与现有配置不一致。`)
      }
      if (!replaceSecrets && item.type === 'secret_text' && before.bindings.some(binding => binding.name === item.name))
        throw new SyncError(`Cloudflare Secret ${item.name} 已存在；确认原值后使用 --replace-secrets。`)
    }
    const changed = plan.worker.filter(item => item.type === 'secret_text' || !before.bindings.some(binding => binding.name === item.name && binding.text === item.value))
    if (changed.length) {
      if (await deployedVersion(io) !== version)
        throw new SyncError('检查期间 Worker 版本变化，已停止；请在没有其他部署时重试。')
      const names = new Set(changed.map(item => item.name))
      // Inherit every untouched binding, including secrets whose values cannot be read.
      const bindings = [
        ...before.bindings.filter(item => !names.has(item.name)).map(item => ({ name: item.name, type: 'inherit' })),
        ...changed.map(item => ({ name: item.name, type: item.type, text: item.value })),
      ]
      const body = new FormData()
      body.set('settings', JSON.stringify({ bindings }))
      io.log('开始更新 Cloudflare 配置；会生成配置版本，不上传本地代码。')
      await io.cloudflare('/settings', body)
      const after = checked(settingsSchema, await io.cloudflare('/settings'))
      verifyBindings(before, after, plan)
      io.log('Cloudflare 配置已写入；旧名称和其他绑定仍在。')
    }
  }
  for (const [kind, entries] of [['secret', plan.githubSecrets], ['variable', plan.githubVariables]] as const) {
    for (const item of entries) {
      // Standard input avoids putting values in process arguments or shell history.
      await io.github([kind, 'set', item.name], item.value)
      io.log(`GitHub ${kind} 已写入：${item.name}`)
    }
  }
  io.log('本批配置写入完成；这不代表所有发布配置已齐全或线上验收通过。')
}

function verifyBindings(before: Settings, after: Settings, plan: SyncPlan) {
  for (const expected of [...before.bindings, ...plan.worker]) {
    const actual = after.bindings.find(item => item.name === expected.name)
    if (!actual || actual.type !== expected.type)
      throw new SyncError('Cloudflare 写入后绑定核对失败；请检查平台状态，停止后续发布。')
  }
  for (const item of plan.worker.filter(item => item.type === 'plain_text')) {
    if (after.bindings.find(binding => binding.name === item.name)?.text !== item.value)
      throw new SyncError('Cloudflare 明文配置核对失败，停止后续发布。')
  }
}
