import { z } from 'zod'
import { sortPosts } from '../../../shared/content/catalog'

export const searchSectionsSchema = z.array(z.object({
  id: z.string(),
  path: z.string().startsWith('/posts/').refine(path => !/[?#\\\r\n]/.test(path)),
  title: z.string(),
  titles: z.array(z.string()),
  content: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  categories: z.array(z.string()),
  pin: z.number().int().nonnegative(),
  publish: z.string(),
}))

export type SearchSection = z.infer<typeof searchSectionsSchema>[number]
export interface SearchDocument extends SearchSection { articleTitle: string }
export interface SearchResult {
  id: string
  title: string
  section: string
  excerpt: string
}

export function searchTerms(query: string): string[] {
  return [...new Set(query.trim().toLowerCase().split(/\s+/).filter(Boolean))]
}

export function prepareSearchDocuments(value: unknown): SearchDocument[] {
  const sections = searchSectionsSchema.parse(value)
  const titles = new Map(sections.filter(section => section.id === section.path).map(section => [section.path, section.title]))
  return sortPosts(sections).map(section => ({ ...section, articleTitle: titles.get(section.path) ?? section.titles[0] ?? section.title }))
}

function sectionTarget(section: SearchDocument): string {
  const prefix = `${section.path}#`
  const anchor = section.id.startsWith(prefix) ? section.id.slice(prefix.length) : ''
  return anchor && anchor !== 'undefined' && anchor !== 'null' && !/[\s#]/.test(anchor)
    ? section.id
    : section.path
}

export function searchArticles(documents: readonly SearchDocument[], query: string) {
  const terms = searchTerms(query)
  if (!terms.length)
    return { results: [] as SearchResult[], total: 0 }
  const matches = new Map<string, { result: SearchResult, score: number }>()
  for (const document of documents) {
    const heading = document.id === document.path ? '' : document.title
    const fields = [document.articleTitle, heading, [...document.tags, ...document.categories].join(' '), document.description, document.content].map(text => text.toLowerCase())
    const positions = terms.map(term => fields.findIndex(field => field.includes(term)))
    if (positions.includes(-1))
      continue
    // Base exceeds the number of terms, so one title hit outranks all lower fields.
    const base = terms.length + 1
    const score = positions.reduce((sum, position) => sum + base ** (4 - position), 0)
    if ((matches.get(document.path)?.score ?? -1) >= score)
      continue
    const bodyMatch = positions.some(position => position === 1 || position === 4)
    const target = bodyMatch ? sectionTarget(document) : document.path
    const content = bodyMatch ? document.content : document.description
    const text = content.replace(/\s+/g, ' ').trim()
    const first = Math.min(...terms.map(term => text.toLowerCase().indexOf(term)).filter(index => index >= 0))
    const start = Number.isFinite(first) ? Math.max(0, first - 35) : 0
    const excerpt = `${start ? '…' : ''}${text.slice(start, start + 150)}${text.length > start + 150 ? '…' : ''}`
    matches.set(document.path, {
      score,
      result: { id: target, title: document.articleTitle, section: target === document.path ? '' : heading, excerpt },
    })
  }
  return {
    results: [...matches.values()].sort((a, b) => b.score - a.score).slice(0, 20).map(match => match.result),
    total: matches.size,
  }
}

export function highlightParts(text: string, query: string): { text: string, marked: boolean }[] {
  const terms = searchTerms(query)
  const normalized = text.toLowerCase()
  const ranges: [number, number][] = []
  for (const term of terms) {
    let offset = normalized.indexOf(term)
    while (offset >= 0) {
      ranges.push([offset, offset + term.length])
      offset = normalized.indexOf(term, offset + term.length)
    }
  }
  const merged: [number, number][] = []
  for (const range of ranges.sort((a, b) => a[0] - b[0])) {
    const previous = merged.at(-1)
    if (previous && range[0] <= previous[1])
      previous[1] = Math.max(previous[1], range[1])
    else
      merged.push([...range])
  }
  const parts: { text: string, marked: boolean }[] = []
  let end = 0
  for (const range of merged) {
    if (range[0] > end)
      parts.push({ text: text.slice(end, range[0]), marked: false })
    parts.push({ text: text.slice(...range), marked: true })
    end = range[1]
  }
  if (end < text.length)
    parts.push({ text: text.slice(end), marked: false })
  return parts
}
