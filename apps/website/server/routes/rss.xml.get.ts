import { queryCollection } from '@nuxt/content/server'
import { createRssFeed } from '../../shared/rss/feed'

export default defineEventHandler(async (event) => {
  const posts = await queryCollection(event, 'posts')
    .select('path', 'stem', 'title', 'description', 'publish', 'update')
    .all()
  const { site } = useAppConfig()
  const config = useRuntimeConfig(event)
  return createRssFeed(posts, {
    name: site.name,
    description: site.description,
    author: site.owner.name,
    siteUrl: config.public.siteUrl,
    baseURL: config.app.baseURL,
  })
})
