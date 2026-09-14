export type SiteSection = 'posts' | 'categories' | 'tools' | 'about'
export type PageKind = 'index' | 'detail'

export interface PageContext {
  path: string
  section: SiteSection
  kind: PageKind
  title: string
  parentPath: string
}

export function isInternalPath(value: unknown): value is string {
  return (
    typeof value === 'string'
    && value.startsWith('/')
    && !value.startsWith('//')
    && !/[\\\r\n]/.test(value)
  )
}

export function resolveBackTarget(previousPath: unknown, context: PageContext): string {
  return isInternalPath(previousPath) && previousPath !== context.path
    ? previousPath
    : context.parentPath
}
