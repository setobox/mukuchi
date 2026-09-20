import type { RehypeHighlightOption } from '@nuxtjs/mdc'
import type { Asset } from '../../../shared/admin/model'
import type { ArticlePreview } from '../../../shared/admin/preview'
import type { SummaryState } from '../../../shared/ai/model'
import { parseMarkdown } from '@nuxtjs/mdc/runtime'
import rehypeHighlight from '@nuxtjs/mdc/runtime/highlighter/rehype'
import { AdminError, articleRoute } from '../../../shared/admin/model'
import { splitDocument, validateFrontmatter } from '../../../shared/content/document'
import { postSchema } from '../../../shared/content/schema'

/** Rendering is read-only: private assets and summary text only change the response. */
export async function renderArticlePreview(source: string, path: string, assets: Asset[], prefix: string, summary: SummaryState, summaryText?: string, highlighter?: RehypeHighlightOption['highlighter']): Promise<ArticlePreview> {
  try {
    const data = { ...postSchema.parse(validateFrontmatter(source, path, 'posts')), path: articleRoute(path) }
    const highlight = { theme: { default: 'github-dark', light: 'github-light' }, highlighter }
    const parsed = await parseMarkdown(splitDocument(source).body, {
      contentHeading: false,
      highlight,
      ...(highlighter ? { rehype: { plugins: { highlight: { instance: rehypeHighlight, options: highlight } } } } : {}),
      toc: { depth: 5, searchDepth: 12 },
    })
    const text = data.aiSummary && summaryText !== undefined ? summaryText.trim() : summary.status === 'valid' ? summary.record?.text : undefined
    data.summarySource = text ? 'ai' : 'description'
    if (text)
      data.description = text
    const urls = new Map(assets.map(asset => [asset.path, `${prefix}/api/admin/assets/${asset.id}`]))
    function rewrite(node: { props?: Record<string, unknown>, children?: unknown[] }) {
      if (node.props) {
        for (const key of ['src', 'cover', 'poster']) {
          const value = node.props[key]
          if (typeof value === 'string' && urls.has(value))
            node.props[key] = urls.get(value)
        }
      }
      for (const child of node.children ?? []) {
        if (child && typeof child === 'object')
          rewrite(child)
      }
    }
    rewrite(parsed.body)
    if (data.cover && urls.has(data.cover))
      data.cover = urls.get(data.cover)
    return { data, body: parsed.body, toc: parsed.toc }
  }
  catch (error) {
    throw new AdminError(422, error instanceof Error ? error.message : '文章解析失败，请检查源码后重试')
  }
}
