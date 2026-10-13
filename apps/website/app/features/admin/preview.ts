import type { RehypeHighlightOption } from '@nuxtjs/mdc'
import type { ArticlePreview, ArticlePreviewContext } from '#shared/admin/preview'
import { parseMarkdown } from '@nuxtjs/mdc/runtime'
import rehypeHighlight from '@nuxtjs/mdc/runtime/highlighter/rehype'
import { codeHighlight } from '#shared/content/code'
import { splitDocument } from '#shared/content/document'
import { countReadingWords } from '#shared/content/reading'

/** Called only by the client preview page: parsing and highlighting must not run on Workers. */
export async function renderArticlePreview(source: string, context: ArticlePreviewContext, highlighter?: RehypeHighlightOption['highlighter']): Promise<ArticlePreview> {
  const highlight = highlighter ? { ...codeHighlight, highlighter } : false
  const parsed = await parseMarkdown(splitDocument(source).body, {
    contentHeading: false,
    highlight,
    ...(highlight ? { rehype: { plugins: { highlight: { instance: rehypeHighlight, options: highlight } } } } : {}),
    toc: { depth: 5, searchDepth: 12 },
  })
  function rewrite(node: { props?: Record<string, unknown>, children?: unknown[] }) {
    if (node.props) {
      for (const key of ['src', 'cover', 'poster']) {
        const value = node.props[key]
        if (typeof value === 'string' && Object.hasOwn(context.assetUrls, value))
          node.props[key] = context.assetUrls[value]
      }
    }
    for (const child of node.children ?? []) {
      if (child && typeof child === 'object')
        rewrite(child)
    }
  }
  rewrite(parsed.body)
  return { data: { ...context.data, wordCount: countReadingWords(parsed.body) }, body: parsed.body, toc: parsed.toc }
}
