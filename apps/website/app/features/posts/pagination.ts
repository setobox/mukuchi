export const postPageSize = 10

export function parsePostPage(value: unknown): number {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value))
    return 1
  const page = Number(value)
  return Number.isSafeInteger(page) ? page : 1
}

export function paginatePosts<T>(posts: readonly T[], value: unknown) {
  const total = posts.length
  const pageCount = Math.max(1, Math.ceil(total / postPageSize))
  const page = Math.min(parsePostPage(value), pageCount)
  return {
    total,
    pageCount,
    page,
    posts: posts.slice((page - 1) * postPageSize, page * postPageSize),
  }
}

export function postPageNumbers(page: number, pageCount: number): (number | 'ellipsis')[] {
  if (pageCount <= 7)
    return Array.from({ length: pageCount }, (_, index) => index + 1)
  const pages = [...new Set([1, page - 1, page, page + 1, pageCount])]
    .filter(value => value >= 1 && value <= pageCount)
    .sort((a, b) => a - b)
  const items: (number | 'ellipsis')[] = []
  for (const [index, value] of pages.entries()) {
    const previous = pages[index - 1]
    if (previous !== undefined && value - previous > 1)
      items.push(value - previous === 2 ? previous + 1 : 'ellipsis')
    items.push(value)
  }
  return items
}
