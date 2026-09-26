import type { PostSummary } from './schema.ts'

export type SeriesPost = Pick<PostSummary, 'path' | 'title' | 'publish' | 'series' | 'seriesOrder'>
export interface PostSeries<T extends SeriesPost = SeriesPost> { name: string, posts: T[] }

function compare(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Series order is editorial; pin weights and source filenames do not apply. */
export function compareSeriesPosts(a: SeriesPost, b: SeriesPost): number {
  const left = a.seriesOrder ?? Number.POSITIVE_INFINITY
  const right = b.seriesOrder ?? Number.POSITIVE_INFINITY
  return (left === right ? 0 : left - right) || compare(b.publish, a.publish) || compare(a.path, b.path)
}

export function collectSeries<T extends SeriesPost>(posts: readonly T[]): PostSeries<T>[] {
  const groups = new Map<string, T[]>()
  for (const post of posts) {
    const name = post.series?.trim()
    if (!name)
      continue
    const group = groups.get(name) ?? []
    group.push(post)
    groups.set(name, group)
  }
  return [...groups].sort(([a], [b]) => compare(a, b)).map(([name, entries]) => ({ name, posts: entries.sort(compareSeriesPosts) }))
}
