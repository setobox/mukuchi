import type { ContentFile, PublishImage } from '../admin/database'
import { z } from 'zod'
import { AdminError, articleRoute, filePathSchema } from '../../../shared/admin/model'

const shaResult = z.object({ sha: z.string().regex(/^[\da-f]{40}$/) })
const treeResult = z.object({ sha: z.string(), truncated: z.boolean().optional(), tree: z.array(z.object({ path: z.string(), type: z.string(), sha: z.string(), mode: z.string().optional() })) })
function encode(bytes: Uint8Array) {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
  return btoa(binary)
}
export function createGithub(options: { repository: string, branch: string, token: string }, request: typeof fetch = fetch) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(options.repository) || !options.branch)
    throw new AdminError(503, '仓库配置无效')
  const root = `https://api.github.com/repos/${options.repository}`
  async function api(path: string, method = 'GET', body?: unknown): Promise<unknown> {
    if (!options.token)
      throw new AdminError(503, '仓库发布凭据尚未配置')
    // Workers supports manual redirects; reject 3xx below without forwarding credentials.
    const response = await request(`${root}${path}`, { method, redirect: 'manual', headers: { 'Authorization': `Bearer ${options.token}`, 'Accept': 'application/vnd.github+json', 'User-Agent': 'mukuchi-admin', 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) })
    if (response.status === 409 || response.status === 422)
      throw new AdminError(409, '仓库已有新修改，请重新检查后发布')
    if (!response.ok)
      throw new AdminError(503, response.status === 401 || response.status === 403 ? 'GitHub 凭据或仓库权限不可用' : 'GitHub 请求失败，请稍后重试')
    return response.json()
  }
  async function head() {
    const ref = z.object({ object: shaResult }).parse(await api(`/git/ref/heads/${encodeURIComponent(options.branch)}`))
    const commit = z.object({ tree: shaResult }).parse(await api(`/git/commits/${ref.object.sha}`))
    const tree = treeResult.parse(await api(`/git/trees/${commit.tree.sha}?recursive=1`))
    if (tree.truncated)
      throw new AdminError(503, '仓库目录过大，无法完整校验文章路径')
    return { commit: ref.object.sha, tree }
  }
  async function blob(sha: string) {
    const result = z.object({ content: z.string(), encoding: z.literal('base64'), size: z.number() }).parse(await api(`/git/blobs/${sha}`))
    if (result.size > 512 * 1024)
      throw new AdminError(413, '文章超过 512 KiB，不能在后台编辑')
    return new TextDecoder().decode(Uint8Array.from(atob(result.content.replace(/\s/g, '')), c => c.charCodeAt(0)))
  }
  async function files() {
    const snapshot = await head()
    return { snapshot, entries: snapshot.tree.tree.filter(entry => entry.type === 'blob' && entry.mode !== '120000' && entry.path.startsWith('content/posts/') && entry.path.endsWith('.md')) }
  }
  return {
    api,
    async list(): Promise<ContentFile[]> {
      const { entries } = await files()
      const result: ContentFile[] = []
      for (const entry of entries) result.push({ path: entry.path.slice('content/posts/'.length), source: await blob(entry.sha), hash: entry.sha })
      return result
    },
    async read(path: string): Promise<ContentFile | null> {
      const { entries } = await files()
      const entry = entries.find(entry => entry.path === `content/posts/${filePathSchema.parse(path)}`)
      return entry ? { path, source: await blob(entry.sha), hash: entry.sha } : null
    },
    async prepare(input: { path: string, source: string, baseHash: string | null, remove: boolean, images: PublishImage[], operationId: string }, checkpoint: () => Promise<void> = async () => {}) {
      const path = `content/posts/${filePathSchema.parse(input.path)}`
      const snapshot = await head()
      const current = snapshot.tree.tree.find(entry => entry.path === path)
      if (current?.mode === '120000' || (current?.sha ?? null) !== input.baseHash)
        throw new AdminError(409, '远程文章已修改，请查看远程版本并处理冲突')
      if (!input.remove && snapshot.tree.tree.some(entry => entry.path !== path && entry.path.startsWith('content/posts/') && entry.path.endsWith('.md') && articleRoute(entry.path.slice(14)) === articleRoute(input.path)))
        throw new AdminError(409, '文章路径规范化后与已有文章冲突')
      const tree: { path: string, mode: string, type: string, sha: string | null }[] = []
      for (const image of input.images) {
        await checkpoint()
        if (!/^\/images\/[\da-f]{64}\.(?:png|jpg|webp|gif)$/.test(image.path))
          throw new AdminError(400, '图片路径无效')
        const result = shaResult.parse(await api('/git/blobs', 'POST', { content: encode(image.bytes), encoding: 'base64' }))
        const imagePath = `apps/website/public${image.path}`
        const existing = snapshot.tree.tree.find(entry => entry.path === imagePath)
        if (existing && existing.sha !== result.sha)
          throw new AdminError(409, '仓库图片路径内容冲突')
        tree.push({ path: imagePath, mode: '100644', type: 'blob', sha: result.sha })
      }
      await checkpoint()
      const article = input.remove ? null : shaResult.parse(await api('/git/blobs', 'POST', { content: input.source, encoding: 'utf-8' })).sha
      tree.push({ path, mode: '100644', type: 'blob', sha: article })
      const nextTree = shaResult.parse(await api('/git/trees', 'POST', { base_tree: snapshot.tree.sha, tree }))
      const commit = shaResult.parse(await api('/git/commits', 'POST', { message: `${input.remove ? 'content: unpublish' : 'content: publish'} ${input.path}\n\nPublication: ${input.operationId}`, tree: nextTree.sha, parents: [snapshot.commit] }))
      return { commit: commit.sha, hash: article }
    },
    async commit(sha: string) { await api(`/git/refs/heads/${encodeURIComponent(options.branch)}`, 'PATCH', { sha, force: false }) },
    async includes(sha: string) {
      const comparison = z.object({ status: z.string() }).parse(await api(`/compare/${sha}...${encodeURIComponent(options.branch)}`))
      return comparison.status === 'identical' || comparison.status === 'ahead'
    },
    async status(sha: string) {
      const result = z.object({ workflow_runs: z.array(z.object({ id: z.number(), event: z.string(), head_branch: z.string().nullable(), status: z.string(), conclusion: z.string().nullable(), html_url: z.url() })) }).parse(await api(`/actions/workflows/deploy.yml/runs?head_sha=${sha}&per_page=20`))
      const run = result.workflow_runs.find(run => run.head_branch === options.branch && run.event !== 'pull_request')
      if (!run)
        return { status: 'submitted' as const, url: null }
      if (run.status !== 'completed')
        return { status: 'building' as const, url: run.html_url }
      if (run.conclusion !== 'success')
        return { status: 'failed' as const, url: run.html_url }
      const jobs = z.object({ jobs: z.array(z.object({ steps: z.array(z.object({ name: z.string(), conclusion: z.string().nullable() })).optional() })) }).parse(await api(`/actions/runs/${run.id}/jobs`))
      const steps = jobs.jobs.flatMap(job => job.steps ?? [])
      const verified = ['Deploy production', 'Verify production'].every(name => steps.some(step => step.name === name && step.conclusion === 'success'))
      return { status: verified ? 'live' as const : 'unknown' as const, url: run.html_url }
    },
  }
}
