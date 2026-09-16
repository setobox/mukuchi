import type { H3Event } from 'h3'
import type { z } from 'zod'
import type { publicationInput } from '../../../shared/admin/model'
import { publishLocal } from '#admin-driver'
import { adminOptions, adminStorage, withAdmin } from '../admin/http'
import { imageReferences } from '../drafts/content'
import { executePublication } from './engine'
import { createGithub } from './github'

export function githubClient(event: H3Event) {
  const config = useRuntimeConfig(event)
  return createGithub({ repository: config.githubRepository, branch: config.githubBranch, token: config.githubPublishToken })
}
async function cleanupAssets(event: H3Event, draftId: string, source: string) {
  const references = await imageReferences(source)
  const assets = await withAdmin(event, repo => repo.assets(draftId))
  for (const asset of assets.filter(asset => references.has(asset.path))) {
    await adminStorage(event).remove(asset.id)
    await withAdmin(event, repo => repo.query('DELETE FROM admin_assets WHERE id = ?', [asset.id]))
  }
}
export async function publishDraft(event: H3Event, input: z.infer<typeof publicationInput>) {
  return executePublication({
    local: import.meta.dev,
    withRepo: action => withAdmin(event, action),
    storage: adminStorage(event),
    github: githubClient(event),
    publishLocal: input => publishLocal(adminOptions(event), input),
    cleanup: (id, source) => cleanupAssets(event, id, source),
  }, input)
}
export async function publicationStatus(event: H3Event, id: string) {
  const record = await withAdmin(event, repo => repo.publication(id))
  if (import.meta.dev || !record.commit || ['preparing', 'live', 'local'].includes(record.status))
    return record
  try {
    const github = githubClient(event)
    if (record.status === 'failed' && !await github.includes(record.commit))
      return record
    const next = await github.status(record.commit)
    await withAdmin(event, repo => repo.query('UPDATE admin_publications SET status = ?, url = ?, message = ? WHERE id = ?', [next.status, next.url, next.status === 'failed' ? '构建或部署失败，请查看运行记录' : '', id]))
    if (next.status === 'live' && record.action === 'publish') {
      const row = await withAdmin(event, async repo => (await repo.query('SELECT source FROM admin_publications WHERE id = ?', [id]))[0])
      if (row)
        await cleanupAssets(event, record.draftId, String(row.source)).catch(() => {})
    }
    return await withAdmin(event, repo => repo.publication(id))
  }
  catch { return { ...record, status: 'unknown' as const, message: '暂时无法查询发布状态，已保存的内容不会丢失' } }
}
