import { defineCollectionSource, defineContentConfig } from '@nuxt/content'
import config from '../../../content.config'

const body = ['---', 'title: " 测试文章 "', 'description: 测试描述', 'publish: "2024-02-29"', '---', '# 正文'].join('\n')

export default defineContentConfig({
  collections: {
    posts: {
      ...config.collections.posts,
      source: [defineCollectionSource({
        prefix: '/posts',
        getKeys: async () => [
          '1.markdown/_getting-started.md',
          '1.markdown/01.markdown.md',
          '1.guide/2.installation.md',
          'notes/index.md',
          'index.md',
        ],
        getItem: async () => body,
      })],
    },
    about: {
      ...config.collections.about,
      source: [defineCollectionSource({
        prefix: '/',
        getKeys: async () => ['about.md'],
        getItem: async () => body,
      })],
    },
  },
})
