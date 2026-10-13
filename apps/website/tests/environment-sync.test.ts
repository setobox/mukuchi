import type { SyncAdapters } from '../scripts/environment-sync'
import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { applyPlan, createPlan, decodeJson, preview } from '../scripts/environment-sync'

const secret = Buffer.alloc(32, 7).toString('base64')
const comments = { PUBLIC_GISCUS_REPO: 'owner/comments', PUBLIC_GISCUS_REPO_ID: 'repo-id', PUBLIC_GISCUS_CATEGORY_ID: 'category-id' }

function platform() {
  let bindings: { name: string, type: string, text?: string }[] = [
    { name: 'NUXT_AI_ENCRYPTION_KEY', type: 'secret_text' },
    { name: 'NUXT_PUBLIC_GISCUS_REPO', type: 'plain_text', text: 'owner/comments' },
    { name: 'ADMIN_DB', type: 'd1' },
    { name: 'ADMIN_ASSETS', type: 'r2_bucket' },
    { name: 'ARTICLE_AUDIO_WORKFLOW', type: 'workflow' },
  ]
  const writes: string[] = []
  const github = vi.fn<SyncAdapters['github']>(async (args) => {
    if (args[1] === 'list')
      return '[]'
    writes.push(`github:${args[2]}`)
    return ''
  })
  const cloudflare = vi.fn<SyncAdapters['cloudflare']>(async (path, body) => {
    if (path === '/deployments')
      return { deployments: [{ id: 'deployment-1', versions: [{ version_id: 'version-1', percentage: 100 }] }] }
    if (path.startsWith('/versions'))
      return { items: [{ id: 'version-1' }] }
    if (body) {
      const settings = JSON.parse(String(body.get('settings'))) as { bindings: { name: string, type: string, text?: string }[] }
      bindings = settings.bindings.map(item => item.type === 'inherit' ? bindings.find(old => old.name === item.name)! : item)
      writes.push('cloudflare')
    }
    return { bindings }
  })
  const log = vi.fn<SyncAdapters['log']>()
  return { io: { github, cloudflare, log }, writes, getBindings: () => bindings }
}

describe('production environment batch configuration', () => {
  it('maps shared credentials and public comments from a single value without preview leaks', () => {
    const plan = createPlan({ ...comments, AI_ENCRYPTION_KEY: secret, AUDIO_SYNC_TOKEN: 's'.repeat(32), OIDC_CLIENT_SECRET: 'private-client-secret', STATS_ADMIN_TOKEN: '' })
    expect(plan.githubSecrets).toEqual([{ name: 'AI_ENCRYPTION_KEY', value: secret }, { name: 'AUDIO_SYNC_TOKEN', value: 's'.repeat(32) }])
    expect(plan.githubVariables.map(item => item.name)).toEqual(['MUKUCHI_GISCUS_CATEGORY_ID', 'MUKUCHI_GISCUS_REPO', 'MUKUCHI_GISCUS_REPO_ID'])
    expect(plan.githubSecrets.some(item => item.name === 'OIDC_CLIENT_SECRET')).toBe(false)
    expect(preview(plan).join('\n')).not.toContain(secret)
    expect(preview(plan).join('\n')).not.toContain('private-client-secret')
    expect(plan.worker.some(item => item.name === 'STATS_ADMIN_TOKEN')).toBe(false)
  })

  it.each([
    { NUXT_AI_ENCRYPTION_KEY: secret },
    { PUBLIC_UNKNOWN: secret },
    { ADMIN_DATABASE_PATH: 'file' },
    { CLOUDFLARE_API_TOKEN: secret },
    { AI_ENCRYPTION_KEY: null },
    { AI_ENCRYPTION_KEY: 'invalid' },
    { AUDIO_SYNC_TOKEN: 'short' },
    { STATS_HASH_SECRET: 'short' },
    { STATS_ADMIN_TOKEN: 'line\nbreak' },
    { OIDC_SCOPES: 'admin' },
    { AUTH_SESSION_MAX_AGE: '0' },
    { APP_ORIGIN: 'http://example.com' },
    { PUBLIC_GISCUS_REPO: 'owner/repo' },
    { CLOUDFLARE_ACCOUNT_ID: 'other-account' },
  ])('rejects unsupported fields and malformed configuration', (input) => {
    expect(() => createPlan(input)).toThrow()
  })

  it('does not echo malformed JSON containing a secret', () => {
    expect(() => decodeJson(`{"secret":"${secret}`)).toThrow('JSON 格式不正确')
    try {
      decodeJson(secret)
    }
    catch (error) { expect(String(error)).not.toContain(secret) }
  })

  it('inherits old secrets and resources while adding typed bindings and sharing identical values', async () => {
    const { io, writes, getBindings } = platform()
    await applyPlan(createPlan({ ...comments, AI_ENCRYPTION_KEY: secret }), io)
    const patch = io.cloudflare.mock.calls.find(call => call[1])?.[1]
    const serialized = String(patch?.get('settings'))
    expect(serialized).toContain('"name":"ADMIN_DB","type":"inherit"')
    expect(serialized).toContain('"name":"NUXT_AI_ENCRYPTION_KEY","type":"inherit"')
    expect(serialized).not.toContain('old_name')
    expect(getBindings()).toEqual(expect.arrayContaining([
      { name: 'ADMIN_DB', type: 'd1' },
      { name: 'ADMIN_ASSETS', type: 'r2_bucket' },
      { name: 'ARTICLE_AUDIO_WORKFLOW', type: 'workflow' },
      { name: 'AI_ENCRYPTION_KEY', type: 'secret_text', text: secret },
      { name: 'PUBLIC_GISCUS_REPO', type: 'plain_text', text: 'owner/comments' },
    ]))
    expect(io.github).toHaveBeenCalledWith(['secret', 'set', 'AI_ENCRYPTION_KEY'], secret)
    expect(writes[0]).toBe('cloudflare')
    expect(JSON.stringify(io.log.mock.calls)).not.toContain(secret)
  })

  it('refuses to replace an existing secret unless explicitly selected', async () => {
    const { io, writes } = platform()
    io.github.mockResolvedValueOnce('[{"name":"AI_ENCRYPTION_KEY"}]')
    await expect(applyPlan(createPlan({ AI_ENCRYPTION_KEY: secret }), io)).rejects.toThrow('--replace-secrets')
    expect(writes).toEqual([])
  })

  it('preserves secret types and fails preflight before any writes', async () => {
    const { io, writes, getBindings } = platform()
    getBindings().push({ name: 'NUXT_PUBLIC_GISCUS_CATEGORY_ID', type: 'secret_text' })
    await expect(applyPlan(createPlan(comments), io)).rejects.toThrow('类型')
    expect(writes).toEqual([])
  })

  it('allows explicitly selected replacement but still preserves the encrypted type', async () => {
    const { io, getBindings } = platform()
    io.github.mockResolvedValueOnce('[{"name":"AI_ENCRYPTION_KEY"}]')
    getBindings().push({ name: 'AI_ENCRYPTION_KEY', type: 'secret_text' })
    await applyPlan(createPlan({ AI_ENCRYPTION_KEY: secret }), io, true)
    expect(io.github).toHaveBeenCalledWith(['secret', 'set', 'AI_ENCRYPTION_KEY'], secret)
    expect(getBindings().find(item => item.name === 'AI_ENCRYPTION_KEY')?.type).toBe('secret_text')
  })

  it('does not expose an existing GitHub secret as a public variable', async () => {
    const { io, writes } = platform()
    io.github.mockResolvedValueOnce('[{"name":"MUKUCHI_GISCUS_REPO"}]')
    await expect(applyPlan(createPlan(comments), io)).rejects.toThrow('已是 Secret')
    expect(writes).toEqual([])
  })

  it('does not continue to GitHub when a binding disappears after the Cloudflare write', async () => {
    const { io, getBindings } = platform()
    const original = io.cloudflare.getMockImplementation()!
    io.cloudflare.mockImplementation(async (path, body) => {
      const result = await original(path, body)
      if (body)
        getBindings().splice(getBindings().findIndex(item => item.name === 'ADMIN_DB'), 1)
      return result
    })
    await expect(applyPlan(createPlan(comments), io)).rejects.toThrow('绑定核对失败')
    expect(io.github.mock.calls.some(([args]) => args[1] === 'set')).toBe(false)
  })

  it('stops when a newer version is not deployed', async () => {
    const { io, writes } = platform()
    io.cloudflare.mockResolvedValueOnce({ deployments: [{ id: 'd1', versions: [{ version_id: 'old', percentage: 100 }] }] })
    await expect(applyPlan(createPlan(comments), io)).rejects.toThrow('未发布版本')
    expect(writes).toEqual([])
  })

  it('stops if a deployment changes between preflight and write', async () => {
    const { io, writes } = platform()
    const original = io.cloudflare.getMockImplementation()!
    let count = 0
    io.cloudflare.mockImplementation(async (path, body) => {
      if (path === '/deployments' && ++count === 2)
        return { deployments: [{ id: 'changed', versions: [{ version_id: 'version-1', percentage: 100 }] }] }
      return original(path, body)
    })
    await expect(applyPlan(createPlan(comments), io)).rejects.toThrow('版本变化')
    expect(writes).toEqual([])
  })

  it('reports partial completion and stops after a failed GitHub write without deleting anything', async () => {
    const { io, writes } = platform()
    io.github.mockImplementation(async (args) => {
      if (args[1] === 'list')
        return '[]'
      throw new Error('simulated failure')
    })
    await expect(applyPlan(createPlan({ AI_ENCRYPTION_KEY: secret, AUDIO_SYNC_TOKEN: 's'.repeat(32) }), io)).rejects.toThrow('simulated failure')
    expect(writes).toEqual(['cloudflare'])
    expect(io.log).toHaveBeenCalledWith('Cloudflare 配置已写入；旧名称和其他绑定仍在。')
    expect(io.github.mock.calls.filter(([args]) => args[1] === 'set')).toHaveLength(1)
  })

  it('runs the actual CLI offline by default without exposing values or requiring credentials', () => {
    const directory = mkdtempSync(join(tmpdir(), 'mukuchi-env-test-'))
    try {
      const path = join(directory, 'input.json')
      writeFileSync(path, JSON.stringify({ AI_ENCRYPTION_KEY: secret }))
      const result = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/sync-environment.ts', import.meta.url)), '--file', path], {
        encoding: 'utf8',
        windowsHide: true,
        env: { ...process.env, CLOUDFLARE_API_TOKEN: '', GH_TOKEN: '', PATH: '' },
      })
      expect(result.status).toBe(0)
      expect(result.stdout).toContain('仅预览，未连接平台')
      expect(result.stdout + result.stderr).not.toContain(secret)
    }
    finally { rmSync(directory, { recursive: true, force: true }) }
  })
})
