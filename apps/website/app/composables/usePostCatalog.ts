import { aggregateTerms, sortPosts } from '~~/shared/content/catalog'

export function usePostCatalog() {
  const query = useAsyncData('posts:catalog', () =>
    queryCollection('posts')
      .select(
        'path',
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
    data: query.data,
    error: query.error,
    status: query.status,
    refresh: query.refresh,
    tags: computed(() => aggregateTerms(query.data.value ?? [], 'tags')),
    categories: computed(() => aggregateTerms(query.data.value ?? [], 'categories')),
  }
}
