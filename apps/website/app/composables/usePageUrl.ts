import type { MaybeRefOrGetter } from 'vue'
import { pageUrl } from '#shared/site/url'

export function usePageUrl(path: MaybeRefOrGetter<string>) {
  const config = useRuntimeConfig()
  return computed(() => pageUrl(config.public.siteUrl, config.app.baseURL, toValue(path)))
}
