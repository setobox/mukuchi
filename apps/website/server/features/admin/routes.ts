import type { H3Event } from 'h3'
import { z } from 'zod'
import { listContent, readContent } from '#admin-driver'
import highlighter from '#admin-preview-highlighter'
import { AdminError, articlePublication, articleTitle, createDraftSchema, imageLimit, newArticleSource, publicationInput, sameArticleSource, saveDraftSchema, sha256 } from '../../../shared/admin/model'
import { writeSummary } from '../ai/content'
import { currentSummary, draftSummaryRoute } from '../ai/service'
import { requireOwner } from '../auth/session'
import { editorSegments, validateArticle } from '../drafts/content'
import { identifyImage } from '../media/images'
import { githubClient, publicationStatus, publishDraft } from '../publishing/service'
import { listArticleRows } from './article-list'
import { adminOptions, adminStorage, readAdminJson, readLimitedBody, withAdmin } from './http'
import { renderArticlePreview } from './preview'

export async function adminRoute(event: H3Event) {
  await requireOwner(event)
  const path = (getRouterParam(event, 'path') ?? '').split('/').filter(Boolean)
  const [resource, rawId, action] = path
  const method = event.method
  const id = rawId ? z.uuid().parse(rawId) : ''
  if (resource === 'articles' && method === 'GET') {
    const files = import.meta.dev ? await listContent(adminOptions(event)) : await githubClient(event).list()
    const drafts = await withAdmin(event, repo => repo.drafts())
    return { articles: files.map((file) => {
      const draft = drafts.find(draft => draft.path === file.path) ?? null
      return { path: file.path, title: articleTitle(file.source, file.path), hash: file.hash, draft, publication: articlePublication(draft, file.source) }
    }), drafts, rows: await listArticleRows(event, files, drafts), local: import.meta.dev }
  }
  if (resource === 'drafts') {
    if (!id && method === 'POST') {
      const input = createDraftSchema.parse(await readAdminJson(event))
      const existing = import.meta.dev ? await readContent(adminOptions(event), input.path) : await githubClient(event).read(input.path)
      return withAdmin(event, repo => repo.create(input.path, existing?.source ?? input.source ?? newArticleSource(), existing?.hash ?? null))
    }
    if (!id)
      throw new AdminError(404, '接口不存在')
    const draft = await withAdmin(event, repo => repo.draft(id))
    if (action === 'summary' && ['GET', 'POST'].includes(method))
      return draftSummaryRoute(event, id)
    if (!action && method === 'GET') {
      const file = import.meta.dev ? await readContent(adminOptions(event), draft.path) : await githubClient(event).read(draft.path)
      return { draft, assets: await withAdmin(event, repo => repo.assets(id)), local: import.meta.dev, publishedSource: file?.source ?? null }
    }
    if (!action && method === 'PUT') {
      const input = saveDraftSchema.parse(await readAdminJson(event))
      if (sameArticleSource(input.source, draft.source)) {
        await withAdmin(event, repo => repo.save(id, input.version, draft.source))
        return withAdmin(event, repo => repo.draft(id))
      }
      const summary = await currentSummary(event, input.source)
      const source = summary.status === 'valid' && summary.record ? writeSummary(input.source, summary.record) : input.source
      await withAdmin(event, repo => repo.save(id, input.version, source))
      return withAdmin(event, repo => repo.draft(id))
    }
    if (!action && method === 'DELETE') {
      // Nitro's Cloudflare adapter does not forward DELETE request bodies.
      const input = z.object({ version: z.coerce.number().int().positive() }).strict().parse(getQuery(event))
      const assets = await withAdmin(event, repo => repo.assets(id))
      await withAdmin(event, repo => repo.remove(id, input.version))
      for (const asset of assets) await adminStorage(event).remove(asset.id)
      await withAdmin(event, repo => repo.query('DELETE FROM admin_assets WHERE draft_id = ?', [id]))
      return { ok: true }
    }
    if (action === 'remote' && method === 'GET')
      return { file: import.meta.dev ? await readContent(adminOptions(event), draft.path) : await githubClient(event).read(draft.path) }
    if (action === 'rebase' && method === 'POST') {
      const input = z.object({ version: z.number().int().positive(), hash: z.string().nullable() }).strict().parse(await readAdminJson(event))
      const current = import.meta.dev ? await readContent(adminOptions(event), draft.path) : await githubClient(event).read(draft.path)
      if ((current?.hash ?? null) !== input.hash)
        throw new AdminError(409, '文件再次发生变化，请重新查看差异')
      const rows = await withAdmin(event, repo => repo.query('UPDATE admin_drafts SET base_hash = ?, version = version + 1 WHERE id = ? AND version = ? AND NOT EXISTS (SELECT 1 FROM admin_publications WHERE draft_id = ? AND status = \'preparing\') RETURNING id', [input.hash, id, input.version, id]))
      if (!rows.length)
        throw new AdminError(409, '草稿已修改或正在发布')
      return withAdmin(event, repo => repo.draft(id))
    }
    if (action === 'validate' && method === 'POST')
      return { metadata: await validateArticle(draft.source, draft.path) }
    if (action === 'segments' && method === 'POST') {
      const input = z.object({ source: saveDraftSchema.shape.source }).strict().parse(await readAdminJson(event))
      return { segments: await editorSegments(input.source) }
    }
    if (action === 'preview' && method === 'POST') {
      const input = z.object({ source: saveDraftSchema.shape.source, summaryText: z.string().max(300).optional() }).strict().parse(await readAdminJson(event))
      const summary = await currentSummary(event, input.source)
      const assets = await withAdmin(event, repo => repo.assets(id))
      const prefix = useRuntimeConfig(event).app.baseURL.replace(/\/$/, '')
      return renderArticlePreview(input.source, draft.path, assets, prefix, summary, input.summaryText, highlighter)
    }
  }
  if (resource === 'assets') {
    if (!id && method === 'POST') {
      const draftId = z.uuid().parse(getQuery(event).draftId)
      await withAdmin(event, repo => repo.draft(draftId))
      const bytes = await readLimitedBody(event, imageLimit)
      const format = identifyImage(bytes)
      const hash = await sha256(bytes)
      const path = `/images/${hash}.${format.extension}`
      const existing = (await withAdmin(event, repo => repo.assets(draftId))).find(asset => asset.path === path)
      if (existing)
        return existing
      const assetId = crypto.randomUUID()
      await adminStorage(event).put(assetId, bytes, format.mime)
      try {
        await withAdmin(event, repo => repo.query('INSERT INTO admin_assets (id,draft_id,path,mime,size,hash,created_at) VALUES (?,?,?,?,?,?,?)', [assetId, draftId, path, format.mime, bytes.length, hash, new Date().toISOString()]))
      }
      catch (error) {
        await adminStorage(event).remove(assetId)
        throw error
      }
      return withAdmin(event, repo => repo.asset(assetId))
    }
    if (id && method === 'GET') {
      const asset = await withAdmin(event, repo => repo.asset(id))
      const bytes = await adminStorage(event).get(id)
      if (!bytes)
        throw new AdminError(404, '暂存图片不存在')
      setResponseHeader(event, 'content-type', asset.mime)
      setResponseHeader(event, 'x-content-type-options', 'nosniff')
      setResponseHeader(event, 'content-security-policy', 'default-src \'none\'; sandbox')
      return bytes
    }
    if (id && method === 'DELETE') {
      const asset = await withAdmin(event, repo => repo.asset(id))
      const draft = await withAdmin(event, repo => repo.draft(asset.draftId))
      const { imageReferences } = await import('../drafts/content')
      if ((await imageReferences(draft.source)).has(asset.path))
        throw new AdminError(409, '请先移除草稿中的图片引用')
      if ((await withAdmin(event, repo => repo.query('SELECT id FROM admin_publications WHERE draft_id = ? AND status IN (\'preparing\',\'submitted\',\'building\',\'unknown\')', [draft.id]))).length)
        throw new AdminError(409, '发布尚未完成，暂时不能删除图片')
      await adminStorage(event).remove(id)
      await withAdmin(event, repo => repo.query('DELETE FROM admin_assets WHERE id = ?', [id]))
      return { ok: true }
    }
  }
  if (resource === 'publications') {
    if (!id && method === 'GET')
      return { publications: await withAdmin(event, repo => repo.publications()) }
    if (!id && method === 'POST')
      return publishDraft(event, publicationInput.parse(await readAdminJson(event)))
    if (id && method === 'GET')
      return publicationStatus(event, id)
  }
  throw new AdminError(404, '接口不存在')
}
