import type { PostSummary } from './schema'
import { comparePostOrder } from './catalog'

export interface ContentTerm { name: string, count: number }

function compare(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Publication chronology deliberately ignores pin weights. */
export function archiveYears<T extends Pick<PostSummary, 'publish' | 'path' | 'stem'>>(posts: readonly T[]) {
  const years = new Map<string, T[]>()
  for (const post of [...posts].sort(comparePostOrder)) {
    const year = post.publish.slice(0, 4)
    const group = years.get(year) ?? []
    group.push(post)
    years.set(year, group)
  }
  return [...years].map(([year, articles]) => ({ year, articles }))
}

export function rankTerms(terms: readonly ContentTerm[]): ContentTerm[] {
  return [...terms].sort((a, b) => b.count - a.count || compare(a.name, b.name))
}

export function searchTerms(terms: readonly ContentTerm[], query: string): ContentTerm[] {
  const needle = query.normalize('NFKC').trim().toLowerCase()
  return terms.filter(term => term.name.normalize('NFKC').toLowerCase().includes(needle))
}
