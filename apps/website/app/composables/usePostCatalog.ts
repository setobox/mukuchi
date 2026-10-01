import { aggregateTerms, sortPosts } from '#shared/content/catalog'
import { collectSeries } from '#shared/content/series'

export function usePostCatalog() {
  const query = useAsyncData('posts:catalog', () =>
    queryCollection('posts')
      .select(
        'path',
        'stem',
        'title',
        'description',
        'wordCount',
        'publish',
        'update',
        'cover',
        'tags',
        'categories',
        'series',
        'seriesOrder',
        'pin',
        'wip',
        'theme',
      )
      .all()
      .then(sortPosts), import.meta.server
    ? {
        dedupe: 'defer',
        getCachedData(key, nuxtApp, context) {
          // SSR's default cache reads static.data, not completed request data.
          // Explicit refreshes and failed refreshes must query again.
          if (context.cause === 'initial' && !nuxtApp.payload._errors[key])
            return nuxtApp.payload.data[key]
        },
      }
    : undefined)
  return {
    ready: query,
    data: query.data,
    error: query.error,
    status: query.status,
    refresh: query.refresh,
    tags: computed(() => aggregateTerms(query.data.value ?? [], 'tags')),
    categories: computed(() => aggregateTerms(query.data.value ?? [], 'categories')),
    series: computed(() => collectSeries(query.data.value ?? [])),
  }
}
