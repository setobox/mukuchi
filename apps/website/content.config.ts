import { fileURLToPath } from 'node:url'
import { defineCollection, defineContentConfig } from '@nuxt/content'
import { summaryContentSource } from './content/ai/source.ts'
import { aboutFields, postFields } from './shared/content/schema.ts'

export default defineContentConfig({
  collections: {
    posts: defineCollection({
      type: 'page',
      source: summaryContentSource(fileURLToPath(new URL('../../content/posts/', import.meta.url))),
      schema: postFields,
      // Check uniqueness after Content applies its default path normalization.
      indexes: [{ columns: ['path'], unique: true }],
    }),
    about: defineCollection({
      type: 'page',
      source: {
        cwd: fileURLToPath(new URL('../../content/', import.meta.url)),
        include: 'about.md',
        prefix: '/',
      },
      schema: aboutFields,
    }),
  },
})
