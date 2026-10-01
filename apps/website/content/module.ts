import type { ContentImportOptions } from './import-policy.ts'
import { defineNuxtModule } from 'nuxt/kit'
import { shanghaiDay } from '../shared/content/notices.ts'
import { prepareDevelopmentDocument } from './development.ts'
import { contentImportPolicy } from './import-policy.ts'
import { markdownWordCount } from './reading.ts'
import { contentRoot, validateContentDirectory, validateFrontmatter } from './validation.ts'

export default defineNuxtModule<ContentImportOptions>({
  meta: { name: 'mukuchi-content-import', configKey: 'contentImport' },
  defaults: { root: contentRoot, fallbackDate: '' },
  async setup(options, nuxt) {
    options.fallbackDate ||= shanghaiDay(new Date())
    nuxt.options.contentImport = options
    const policy = contentImportPolicy(nuxt)
    const warn = (message: string) => console.warn(`[内容预览] ${message}；使用临时元数据，不修改原文件`)
    // Always inspect original files, even when Content can reuse parsed caches.
    await validateContentDirectory({ root: options.root, onInvalid: policy.tolerant ? warn : undefined })
    nuxt.hook('content:file:beforeParse', async ({ file, collection }) => {
      if (!policy.tolerant || (collection.name !== 'posts' && collection.name !== 'about' && collection.name !== 'use'))
        return
      const prepared = await prepareDevelopmentDocument(file.body, file.path, collection.name, policy.fallbackDate)
      prepared.diagnostics.forEach(warn)
      file.body = prepared.source
    })
    nuxt.hook('content:file:afterParse', async ({ file, content, collection }) => {
      if (collection.name !== 'posts' && collection.name !== 'about' && collection.name !== 'use')
        return
      const metadata = policy.tolerant
        ? (await prepareDevelopmentDocument(file.body, file.path, collection.name, policy.fallbackDate)).metadata
        : validateFrontmatter(file.body, file.path, collection.name)
      Object.assign(content, metadata)
      if (collection.name === 'posts')
        content.wordCount = await markdownWordCount(file.body)
    })
  },
})
