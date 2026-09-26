import { aggregateTerms, sortPosts } from '~~/shared/content/catalog'

export function usePostCatalog() {
  const query = useAsyncData('posts:catalog', () =>
    queryCollection('posts')
      .select(
        'path',
        'stem',
        'title',
        'description',
        'publish',
        'update',
        'cover',
        'tags',
        'categories',
        'pin',
        'wip',
        'theme',
      )
      .all()
      .then(sortPosts))
  return {
    ready: query,
    data: query.data,
    error: query.error,
    status: query.status,
    refresh: query.refresh,
    tags: computed(() => aggregateTerms(query.data.value ?? [], 'tags')),
    categories: computed(() => aggregateTerms(query.data.value ?? [], 'categories')),
  }
}
