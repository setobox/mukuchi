import type { AdminDatabase, SqlValue } from './database'
import { AdminError, assetSchema, draftSchema, publicationSchema } from '../../../shared/admin/model'

export function createAdminRepository(db: AdminDatabase) {
  const query = async (sql: string, params: SqlValue[] = []) => (await db.batch([{ sql, params }]))[0]!
  const draftSelect = 'SELECT id, path, source, version, base_hash AS baseHash, published_version AS publishedVersion, updated_at AS updatedAt FROM admin_drafts'
  const assetSelect = 'SELECT id, draft_id AS draftId, path, mime, size, hash, created_at AS createdAt FROM admin_assets'
  const publicationSelect = 'SELECT id, draft_id AS draftId, version, action, status, commit_sha AS "commit", message, created_at AS createdAt, url FROM admin_publications'
  return {
    query,
    batch: db.batch,
    async drafts() { return (await query(`${draftSelect} ORDER BY updated_at DESC`)).map(row => draftSchema.parse(row)) },
    async draft(id: string) {
      const row = (await query(`${draftSelect} WHERE id = ?`, [id]))[0]
      if (!row)
        throw new AdminError(404, '草稿不存在')
      return draftSchema.parse(row)
    },
    async create(path: string, source: string, baseHash: string | null) {
      const id = crypto.randomUUID()
      await query('INSERT INTO admin_drafts (id,path,source,base_hash,published_version,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(path) DO NOTHING', [id, path, source, baseHash, baseHash ? 1 : 0, new Date().toISOString()])
      const row = (await query(`${draftSelect} WHERE path = ?`, [path]))[0]
      if (!row)
        throw new AdminError(503, '无法创建草稿')
      return draftSchema.parse(row)
    },
    async save(id: string, version: number, source: string) {
      const [rows, current] = await db.batch([
        { sql: 'UPDATE admin_drafts SET source = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ? AND source <> ? RETURNING id', params: [source, new Date().toISOString(), id, version, source] },
        { sql: 'SELECT version, source FROM admin_drafts WHERE id = ?', params: [id] },
      ])
      if (!rows?.length && !(current?.[0]?.version === version && current[0].source === source))
        throw new AdminError(409, '草稿已在其他窗口修改，请保留当前内容并重新加载')
    },
    async remove(id: string, version: number) {
      const rows = await query('DELETE FROM admin_drafts WHERE id = ? AND version = ? AND NOT EXISTS (SELECT 1 FROM admin_publications WHERE draft_id = ? AND status = \'preparing\') RETURNING id', [id, version, id])
      if (!rows.length)
        throw new AdminError(409, '草稿已修改或正在发布，暂时不能删除')
    },
    async assets(id: string) { return (await query(`${assetSelect} WHERE draft_id = ?`, [id])).map(row => assetSchema.parse(row)) },
    async asset(id: string) {
      const row = (await query(`${assetSelect} WHERE id = ?`, [id]))[0]
      if (!row)
        throw new AdminError(404, '暂存图片不存在')
      return assetSchema.parse(row)
    },
    async publications() { return (await query(`${publicationSelect} ORDER BY created_at DESC LIMIT 100`)).map(row => publicationSchema.parse(row)) },
    async publication(id: string) {
      const row = (await query(`${publicationSelect} WHERE id = ?`, [id]))[0]
      if (!row)
        throw new AdminError(404, '发布记录不存在')
      return publicationSchema.parse(row)
    },
  }
}
export type AdminRepository = ReturnType<typeof createAdminRepository>
