import type { z } from 'zod'
import type { ArticleCard } from '../../../shared/assistant/model'
import type { SearchDocument } from '../../../shared/content/search'
import { articleCardSchema, referenceSchema, taxonomyItemSchema } from '../../../shared/assistant/model'
import { recallArticles } from '../../../shared/assistant/retrieval'
import { taxonomyPath } from '../../../shared/content/taxonomy'

export interface PublicContentSource {
  sections: () => Promise<SearchDocument[]>
  siteInfo: (scope: 'site' | 'author' | 'all') => Promise<unknown>
}
export interface ArticleReading { article: ArticleCard, sectionId: string | null, text: string, partial: boolean, sections: { id: string, title: string }[] }
function clip(value: string, limit: number) {
  if (value.length <= limit)
    return value
  const text = value.slice(0, limit - 1)
  return `${text.isWellFormed() ? text : text.slice(0, -1)}…`
}
export function createPublicContent(source: PublicContentSource) {
  function card(document: SearchDocument): ArticleCard {
    return articleCardSchema.parse({ articleId: document.path, path: document.path, title: clip(document.articleTitle, 200), description: clip(document.description, 160) })
  }
  return {
    siteInfo: source.siteInfo,
    async article(path: string) {
      const document = (await source.sections()).find(item => item.path === path)
      return document ? card(document) : null
    },
    async search(query: string, options: { limit: number, category?: string | null, tag?: string | null }) {
      return recallArticles(await source.sections(), query, options).map(document => ({ ...card(document), snippet: clip(document.content, 100), section: document.title }))
    },
    async read(path: string, sectionId: string | null): Promise<ArticleReading | null> {
      const documents = (await source.sections()).filter(item => item.path === path)
      const first = documents[0]
      if (!first)
        return null
      const sections = documents.filter(item => item.id.startsWith(`${path}#`)).map(item => ({ id: item.id.slice(path.length + 1), title: clip(item.title, 80) }))
      const selected = sectionId ? documents.filter(item => item.id === `${path}#${sectionId}`) : documents
      if (!selected.length)
        return null
      const text = selected.map(item => `${item.title}\n${item.content}`).join('\n\n')
      return { article: card(first), sectionId, text: clip(text, 750), partial: text.length > 750, sections: sections.slice(0, 8) }
    },
    async taxonomy(kind: 'category' | 'tag' | 'all'): Promise<z.infer<typeof taxonomyItemSchema>[]> {
      const articles = new Map((await source.sections()).map(item => [item.path, item]))
      const items: z.infer<typeof taxonomyItemSchema>[] = []
      for (const type of kind === 'all' ? ['category', 'tag'] as const : [kind]) {
        const counts = new Map<string, number>()
        for (const article of articles.values()) {
          for (const name of new Set(type === 'tag' ? article.tags : article.categories)) counts.set(name, (counts.get(name) ?? 0) + 1)
        }
        for (const [name, count] of counts) items.push(taxonomyItemSchema.parse({ kind: type, name, count, path: taxonomyPath(type, name) }))
      }
      return items.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 12)
    },
    reference(reading: ArticleReading) {
      return referenceSchema.parse({ articleId: reading.article.articleId, path: reading.article.path, title: reading.article.title, ...(reading.sectionId ? { sectionId: reading.sectionId } : {}) })
    },
  }
}
export type PublicContent = ReturnType<typeof createPublicContent>
