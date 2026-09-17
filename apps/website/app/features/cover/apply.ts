import type { Asset, Draft } from '#shared/admin/model'
import type { RasterCover } from './model'
import { isMap, parseDocument } from 'yaml'
import { imageLimit } from '#shared/admin/model'
import { splitDocument } from '#shared/content/document'

export interface CoverApplication {
  prepare: () => Promise<{ source: string, draft: Draft }>
  upload: (draftId: string, blob: Blob) => Promise<Asset>
  current: () => { source: string, version: number }
  save: (id: string, input: { source: string, version: number }) => Promise<Draft>
  commit: (draft: Draft) => void
}
export async function applyGeneratedCover(result: RasterCover, application: CoverApplication) {
  if (!result.blob.size || result.blob.size > imageLimit)
    throw new Error('封面不能超过 5 MiB，请降低分辨率或使用 WebP。')
  if (result.blob.type !== `image/${result.format}`)
    throw new Error('封面格式不匹配，请重新生成。')
  const snapshot = await application.prepare()
  const parts = splitDocument(snapshot.source)
  const document = parseDocument(parts.yaml || '{}')
  if (document.errors.length || !isMap(document.contents))
    throw new Error('请先在源码模式修正文章 YAML 格式。')
  const asset = await application.upload(snapshot.draft.id, result.blob)
  const current = application.current()
  if (current.source !== snapshot.source || current.version !== snapshot.draft.version)
    throw new Error('文章已修改，原封面已保留，请重新应用。')
  document.set('cover', asset.path)
  const saved = await application.save(snapshot.draft.id, { version: snapshot.draft.version, source: `---\n${document.toString()}---\n${parts.body}` })
  application.commit(saved)
}
