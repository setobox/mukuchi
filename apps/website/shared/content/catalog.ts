import type { PostSummary } from './schema.ts'
import type { TaxonomyFilter } from './taxonomy'

export function sortPosts<T extends Pick<PostSummary, 'pin' | 'publish' | 'path'>>(
  posts: readonly T[],
): T[] {
  return [...posts].sort(
    (a, b) => b.pin - a.pin || compare(b.publish, a.publish) || compare(a.path, b.path),
  )
}
function compare(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0
}

export function filterPosts<T extends Pick<PostSummary, 'tags' | 'categories'>>(
  posts: readonly T[],
  filter?: TaxonomyFilter,
): T[] {
  return posts.filter(
    post => !filter || post[filter.kind === 'category' ? 'categories' : 'tags'].includes(filter.name),
  )
}
export function aggregateTerms(posts: readonly PostSummary[], field: 'tags' | 'categories') {
  const counts = new Map<string, number>()
  for (const post of posts) {
    for (const name of new Set(post[field])) counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => compare(a.name, b.name))
}
export function formatPostDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(new Date(`${value}T00:00:00+08:00`))
    .replaceAll('/', '-')
}
