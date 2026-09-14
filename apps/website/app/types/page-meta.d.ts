import type { PageKind, SiteSection } from '../shared/navigation.ts'

declare module '#app' {
  interface PageMeta {
    section?: SiteSection
    pageKind?: PageKind
    pageTitle?: string
    parentPath?: string
  }
}

export {}
