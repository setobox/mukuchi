import type { PostSummary } from './schema'
import { comparePostOrder } from './catalog'

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
