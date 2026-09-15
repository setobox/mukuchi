import type { TaxonomyFilter, TaxonomyKind } from '#shared/content/taxonomy'
import { isTaxonomyName } from '#shared/content/taxonomy'

export async function useTaxonomyPage(kind: TaxonomyKind) {
  // Vue Router already decodes each parameter. Do not decode it a second time.
  const name = useRoute().params.name
  const catalog = usePostCatalog()
  await catalog.ready
  if (catalog.error.value)
    throw createError({ statusCode: 500, message: '文章加载失败' })
  const terms = kind === 'category' ? catalog.categories : catalog.tags
  if (typeof name !== 'string' || !isTaxonomyName(name) || !terms.value.some(term => term.name === name))
    throw createError({ statusCode: 404, message: kind === 'category' ? '专栏不存在' : '标签不存在' })
  const filter: TaxonomyFilter = { kind, name }
  return { filter, categories: catalog.categories }
}
