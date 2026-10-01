import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { defineCollection, defineCollectionSource, defineContentConfig } from '@nuxt/content'
import { useNuxt } from 'nuxt/kit'
import { summaryContentSource } from './content/ai/source.ts'
import { contentImportPolicy } from './content/import-policy.ts'
import { aboutFields, postFields } from './shared/content/schema.ts'

const policy = contentImportPolicy(useNuxt())
function pageSource(kind: 'about' | 'use') {
  const filename = join(policy.root, `${kind}.md`)
  return {
    ...defineCollectionSource({
      getKeys: async () => [`${kind}.md`],
      getItem: async () => policy.prepare(await readFile(filename, 'utf8'), filename, kind),
    }),
    cwd: policy.root.replaceAll('\\', '/'),
    include: `${kind}.md`,
    prefix: '/',
  }
}

export default defineContentConfig({
  collections: {
    posts: defineCollection({
      type: 'page',
      source: summaryContentSource(join(policy.root, 'posts'), (source, filename) => policy.prepare(source, filename, 'posts')),
      schema: postFields,
      // Check uniqueness after Content applies its default path normalization.
      indexes: [{ columns: ['path'], unique: true }],
    }),
    about: defineCollection({
      type: 'page',
      source: pageSource('about'),
      schema: aboutFields,
    }),
    use: defineCollection({
      type: 'page',
      source: pageSource('use'),
      schema: aboutFields,
    }),
  },
})
