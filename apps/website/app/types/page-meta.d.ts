import type { RouteLocationNormalizedLoaded } from 'vue-router'
import type { PageKind, SiteSection } from '../shared/navigation.ts'

declare module '#app' {
  interface PageMeta {
    section?: SiteSection
    pageKind?: PageKind
    pageTitle?: string | ((route: RouteLocationNormalizedLoaded) => string)
    parentPath?: string
  }
}

export {}
