import type { ResourceGroup } from '#shared/collections/types'
import { parseMilanoteCollections } from '../features/collections/parser'

const excludedFields = [
  '**.location',
  '**.timestamps',
  'board.color',
  'board.id',
  'board.title',
  'board.type',
  'fetchedAt',
  'source',
  'source.boardId',
  'source.provider',
  'version',
].join(',')

export default defineCachedEventHandler(async (): Promise<ResourceGroup[]> => {
  try {
    const response: unknown = await $fetch('https://mn.setobox.me/api/detail', {
      query: {
        exclude: excludedFields,
        url: 'https://app.milanote.com/1WOTjb1OxP4xfc?p=3Ok1zpJfWiB',
      },
      retry: 0,
      timeout: 5_000,
    })
    return parseMilanoteCollections(response)
  }
  catch (cause) {
    throw createError({ cause, statusCode: 502, statusMessage: 'Unable to load collection data' })
  }
}, {
  getKey: () => 'milanote-board',
  group: 'api',
  name: 'collections',
  maxAge: 60 * 60,
  staleMaxAge: 24 * 60 * 60,
  swr: true,
})
