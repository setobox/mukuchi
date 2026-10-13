import { spawnSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { z } from 'zod'
import { applyPlan, createPlan, decodeJson, preview, SyncError, target } from './environment-sync.ts'

const defaultFile = fileURLToPath(new URL('../../../.data/environment.production.json', import.meta.url))

async function main() {
  const { values } = parseArgs({ options: {
    'file': { type: 'string' },
    'init': { type: 'boolean' },
    'apply': { type: 'boolean' },
    'replace-secrets': { type: 'boolean' },
    'help': { type: 'boolean' },
  } })
  if (values.help) {
    console.log('environment:sync [--init] [--file 文件.json] [--apply [--replace-secrets]]\n默认离线预览；--init 创建空模板；--apply 写入生产。')
    return
  }
  if ((values.init && (values.apply || values['replace-secrets'])) || (values['replace-secrets'] && !values.apply))
    throw new SyncError('参数组合无效：初始化不能同时写入，覆盖密钥必须与 --apply 一起使用。')
  const file = values.file ? resolve(values.file) : defaultFile
  if (values.init) {
    await mkdir(dirname(file), { recursive: true })
    const template = Object.fromEntries([
      'PUBLIC_GISCUS_CATEGORY_ID',
      'PUBLIC_GISCUS_REPO',
      'PUBLIC_GISCUS_REPO_ID',
      'AUTH_SESSION_KEY',
      'OIDC_CLIENT_SECRET',
      'GITHUB_PUBLISH_TOKEN',
      'AI_ENCRYPTION_KEY',
      'AUDIO_SYNC_TOKEN',
      'STATS_ADMIN_TOKEN',
      'STATS_HASH_SECRET',
    ].map(name => [name, '']))
    try {
      await writeFile(file, `${JSON.stringify(template, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
    }
    catch { throw new SyncError('不能创建模板：文件可能已存在，未覆盖原文件。') }
    console.log('空模板已创建。填写生产原值；默认位置是仓库 .data/environment.production.json。')
    return
  }
  let text: string
  try {
    text = await readFile(file, 'utf8')
  }
  catch { throw new SyncError('无法读取配置文件；先运行 --init 创建模板。') }
  const plan = createPlan(decodeJson(text))
  preview(plan).forEach(line => console.log(line))
  if (!values.apply) {
    console.log('仅预览，未连接平台。填写的值用于新增或更新；加 --apply 才执行。')
    return
  }
  const token = process.env.CLOUDFLARE_API_TOKEN
  if (plan.worker.length && !token)
    throw new SyncError('执行前请在当前终端设置 CLOUDFLARE_API_TOKEN（目标账户 Workers Scripts 编辑权限）。')
  await applyPlan(plan, {
    log: message => console.log(message),
    github(args, input) {
      const result = spawnSync('gh', [...args, '--repo', target.repository], {
        input,
        encoding: 'utf8',
        windowsHide: true,
        timeout: 60_000,
        env: { ...process.env, GH_HOST: 'github.com', GH_DEBUG: '', GH_PROMPT_DISABLED: '1' },
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      if (result.error || result.status !== 0)
        throw new SyncError('GitHub 操作失败或超时。检查 gh 登录状态和仓库权限；已完成的写入不会自动回退。')
      return Promise.resolve(result.stdout)
    },
    async cloudflare(path, body) {
      let response: Response
      try {
        response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${target.account}/workers/scripts/${target.worker}${path}`, {
          method: body ? 'PATCH' : 'GET',
          body,
          headers: { Authorization: `Bearer ${token}` },
          redirect: 'error',
          signal: AbortSignal.timeout(30_000),
        })
      }
      catch { throw new SyncError('Cloudflare 网络请求失败或超时；写入结果可能未知，请检查平台后再重试。') }
      const parsed = z.object({ success: z.boolean(), result: z.unknown() }).safeParse(await response.json().catch(() => undefined))
      if (!response.ok || !parsed.success || !parsed.data.success)
        throw new SyncError(`Cloudflare 操作失败（HTTP ${response.status}）；响应内容已隐藏。`)
      return parsed.data.result
    },
  }, values['replace-secrets'])
}

main().catch((error: unknown) => {
  console.error(error instanceof SyncError ? error.message : '操作失败；详情已隐藏以防泄露密钥，请检查参数及本地文件。')
  process.exitCode = 1
})
