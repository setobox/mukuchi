import type { Asset } from '../../../shared/admin/model'
import type { ArticlePreviewContext } from '../../../shared/admin/preview'
import type { SummaryState } from '../../../shared/ai/model'
import { AdminError, articleRoute } from '../../../shared/admin/model'
import { validateFrontmatter } from '../../../shared/content/document'
import { postSchema } from '../../../shared/content/schema'

/** Rendering is read-only: private assets and summary text only change the response. */
export function prepareArticlePreview(source: string, path: string, assets: Asset[], prefix: string, summary: SummaryState, summaryText?: string): ArticlePreviewContext {
  try {
    const data = { ...postSchema.parse(validateFrontmatter(source, path, 'posts')), path: articleRoute(path) }
    const text = data.aiSummary && summaryText !== undefined ? summaryText.trim() : summary.status === 'valid' ? summary.record?.text : undefined
    data.summarySource = text ? 'ai' : 'description'
    if (text)
      data.description = text
    const assetUrls = Object.fromEntries(assets.map(asset => [asset.path, `${prefix}/api/admin/assets/${asset.id}`]))
    if (data.cover && Object.hasOwn(assetUrls, data.cover))
      data.cover = assetUrls[data.cover]
    return { data, assetUrls }
  }
  catch (error) {
    throw new AdminError(422, error instanceof Error ? error.message : '文章解析失败，请检查源码后重试')
  }
}
