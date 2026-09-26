import type { PageContext } from '~/shared/navigation'
import { siteSections } from '~/shared/navigation'

export function usePageContext() {
  const route = useRoute()
  const articleTitle = useState<{ path: string, title: string } | null>(
    'page:article-title',
    () => null,
  )
  return computed<PageContext>(() => {
    const section = siteSections.find(item => item === route.meta.section) ?? 'posts'
    return {
      path: route.path.replace(/\/$/, '') || '/',
      section,
      title:
        articleTitle.value?.path === route.path
          ? articleTitle.value.title
          : typeof route.meta.pageTitle === 'function'
            ? route.meta.pageTitle(route)
            : typeof route.meta.pageTitle === 'string'
              ? route.meta.pageTitle
              : 'mukuchi',
      kind: route.meta.pageKind === 'detail' ? 'detail' : 'index',
      parentPath: typeof route.meta.parentPath === 'string' ? route.meta.parentPath : `/${section}`,
    }
  })
}
