export type TaxonomyKind = 'category' | 'tag'

export interface TaxonomyFilter {
  kind: TaxonomyKind
  name: string
}

export function isTaxonomyName(value: string): boolean {
  const name = value.trim()
  return name.length > 0 && name !== '.' && name !== '..'
    && !/[/\\\p{Cc}]/u.test(value) && name.isWellFormed()
}

export function taxonomyPath(kind: TaxonomyKind, name: string): string {
  if (!isTaxonomyName(name))
    throw new Error('专栏或标签名称不能作为路径段')
  return `/${kind === 'category' ? 'categories' : 'tags'}/${encodeURIComponent(name)}`
}

export function taxonomyTitle(kind: TaxonomyKind, name: unknown): string {
  if (typeof name !== 'string')
    return kind === 'category' ? '专栏' : '标签'
  return kind === 'category' ? name : `标签：${name}`
}
