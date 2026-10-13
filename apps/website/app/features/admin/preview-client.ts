import type { ArticlePreviewContext } from '../../../shared/admin/preview'

export async function renderClientPreview(source: string, context: ArticlePreviewContext) {
  if (import.meta.server)
    throw new Error('文章预览仅在浏览器中生成')
  // Load MDC and its local highlighter only when an authenticated editor opens
  // the preview. Never use MDC's default /api/_mdc/highlight fallback.
  const [{ renderArticlePreview }, { default: highlighter }] = await Promise.all([
    import('./preview'),
    import('#mdc-highlighter'),
  ])
  return renderArticlePreview(source, context, highlighter)
}
