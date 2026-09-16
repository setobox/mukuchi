import type { z } from 'zod'
import type { publicationInput } from '../../../shared/admin/model'
import type { PrivateStorage, PublishImage } from '../admin/database'
import type { AdminRepository } from '../admin/repository'
import type { createGithub } from './github'
import { AdminError } from '../../../shared/admin/model'
import { imageReferences, validateArticle } from '../drafts/content'

export interface PublicationContext {
  local: boolean
  withRepo: <T>(action: (repo: AdminRepository) => Promise<T>) => Promise<T>
  storage: PrivateStorage
  github: ReturnType<typeof createGithub>
  publishLocal: (input: { path: string, source: string, baseHash: string | null, remove: boolean, images: PublishImage[] }) => Promise<string | null>
  cleanup: (draftId: string, source: string) => Promise<void>
}

export async function executePublication(context: PublicationContext, input: z.infer<typeof publicationInput>) {
  const draft = await context.withRepo(repo => repo.draft(input.draftId))
  const prior = await context.withRepo(async repo => (await repo.query('SELECT id FROM admin_publications WHERE id = ? OR (draft_id = ? AND version = ? AND action = ?)', [input.operationId, draft.id, input.version, input.action]))[0])
  if (prior) {
    const existing = await context.withRepo(repo => repo.publication(String(prior.id)))
    if (existing.draftId !== draft.id || existing.version !== input.version || existing.action !== input.action)
      throw new AdminError(409, '发布操作标识已用于其他内容')
    if (!['preparing', 'failed'].includes(existing.status))
      return existing
  }
  if (!prior && draft.version !== input.version)
    throw new AdminError(409, '草稿已更新，请保存后重新发布')
  const id = prior ? String(prior.id) : input.operationId
  const pending = await context.withRepo(repo => repo.query('SELECT id FROM admin_publications WHERE draft_id = ? AND status = \'preparing\' AND id <> ?', [draft.id, id]))
  if (pending.length)
    throw new AdminError(409, '此文章已有待确认的发布，请先刷新发布记录')
  if (!prior)
    await context.withRepo(repo => repo.query('INSERT INTO admin_publications (id,draft_id,version,action,status,created_at,source,base_hash) VALUES (?,?,?,?,\'preparing\',?,?,?) ON CONFLICT DO NOTHING', [id, draft.id, draft.version, input.action, new Date().toISOString(), draft.source, draft.baseHash]))
  const lease = crypto.randomUUID()
  const claimed = await context.withRepo(repo => repo.query('UPDATE admin_publications SET status = \'preparing\', lease_token = ?, lease_until = ? WHERE id = ? AND (lease_until IS NULL OR lease_until < ?) RETURNING id', [lease, Date.now() + 180_000, id, Date.now()]))
  if (!claimed.length)
    throw new AdminError(409, '发布正在处理中，请稍后刷新')
  const checkpoint = async () => {
    const renewed = await context.withRepo(repo => repo.query('UPDATE admin_publications SET lease_until = ? WHERE id = ? AND lease_token = ? RETURNING id', [Date.now() + 180_000, id, lease]))
    if (!renewed.length)
      throw new AdminError(409, '发布执行权已变更，请刷新发布记录')
  }
  let attemptedCommit = false
  try {
    const row = await context.withRepo(async repo => (await repo.query('SELECT commit_sha,result_hash,source,base_hash FROM admin_publications WHERE id = ?', [id]))[0]!)
    const source = String(row.source)
    const remove = input.action === 'unpublish'
    if (!remove)
      await validateArticle(source, draft.path)
    else if (!row.base_hash)
      throw new AdminError(409, '这篇文章尚未发布')
    const references = remove ? new Set<string>() : await imageReferences(source)
    const assets = await context.withRepo(repo => repo.assets(draft.id))
    const images = []
    for (const asset of assets.filter(asset => references.has(asset.path))) {
      await checkpoint()
      const bytes = await context.storage.get(asset.id)
      if (!bytes)
        throw new AdminError(422, '引用的暂存图片缺失，请重新上传')
      images.push({ path: asset.path, bytes })
    }
    let resultHash: string | null
    let commit: string | null = row.commit_sha ? String(row.commit_sha) : null
    if (context.local) {
      await checkpoint()
      attemptedCommit = true
      resultHash = await context.publishLocal({ path: draft.path, source, baseHash: row.base_hash as string | null, remove, images })
    }
    else {
      const github = context.github
      if (!commit) {
        const candidate = await github.prepare({ path: draft.path, source, baseHash: row.base_hash as string | null, remove, images, operationId: id }, checkpoint)
        await checkpoint()
        commit = candidate.commit
        resultHash = candidate.hash
        await context.withRepo(repo => repo.query('UPDATE admin_publications SET commit_sha = ?, result_hash = ? WHERE id = ? AND lease_token = ?', [commit, resultHash, id, lease]))
      }
      else {
        resultHash = row.result_hash as string | null
      }
      await checkpoint()
      attemptedCommit = true
      if (!await github.includes(commit)) {
        await checkpoint()
        await github.commit(commit)
      }
    }
    await checkpoint()
    await context.withRepo(repo => repo.batch([
      { sql: 'UPDATE admin_publications SET status = ?, message = \'\', lease_token = NULL, lease_until = NULL WHERE id = ? AND lease_token = ?', params: [context.local ? 'local' : 'submitted', id, lease] },
      { sql: 'UPDATE admin_drafts SET base_hash = ?, published_version = ?, version = version + ? WHERE id = ?', params: [resultHash, input.version, remove ? 1 : 0, draft.id] },
    ]))
    if (context.local && !remove)
      await context.cleanup(draft.id, source).catch(() => {})
    return await context.withRepo(repo => repo.publication(id))
  }
  catch (error) {
    const uncertain = attemptedCommit && !(error instanceof AdminError && error.statusCode === 409)
    await context.withRepo(repo => repo.query('UPDATE admin_publications SET status = ?, message = ?, lease_token = NULL, lease_until = NULL WHERE id = ? AND lease_token = ?', [uncertain ? 'preparing' : 'failed', uncertain ? '发布结果尚未确认，请重试同一次发布以核实结果' : error instanceof AdminError ? error.message : '发布失败，请重试', id, lease]))
    throw error
  }
}
