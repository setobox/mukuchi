import type { H3Event } from 'h3'
import { queryCollectionSearchSections } from '@nuxt/content/server'
import { prepareSearchDocuments } from '../../../shared/content/search'
import { publicSite } from '../../../shared/content/site'
import { createPublicContent } from './content'

export function publicContent(event: H3Event) {
  // Fetch on each request, so unpublished/removed content cannot survive a stale assistant cache.
  const sections = () => queryCollectionSearchSections(event, 'posts', {
    ignoredTags: ['script', 'style'],
    minHeading: 'h1',
    maxHeading: 'h6',
    extraFields: ['path', 'stem', 'description', 'tags', 'categories', 'pin', 'publish'],
  }).then(prepareSearchDocuments)
  return createPublicContent({
    sections,
    async siteInfo(scope) {
      const about = await queryCollectionSearchSections(event, 'about', { ignoredTags: ['script', 'style'], minHeading: 'h1', maxHeading: 'h6' })
      return {
        ...(scope !== 'author' ? { name: publicSite.name, description: publicSite.description, about: about.map(item => item.content).join('\n').slice(0, 500), aboutPath: '/about' } : {}),
        ...(scope !== 'site' ? { author: { name: publicSite.owner.name, description: publicSite.owner.description, introduction: publicSite.owner.introduction, github: publicSite.owner.github } } : {}),
      }
    },
  })
}
