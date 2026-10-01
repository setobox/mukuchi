import { expect, test } from 'vite-plus/test'
import { prepareDevelopmentDocument } from '../content/development'
import { splitDocument } from '../shared/content/document'

const today = '2026-10-01'

test('缺少元数据时使用正文标题，补全日期并保留正文', async () => {
  const source = '# 文章标题\n\n正文'
  const result = await prepareDevelopmentDocument(source, 'post.md', 'posts', today)
  expect(result.metadata).toMatchObject({ title: '文章标题', description: '', publish: today })
  expect(splitDocument(result.source).body).toBe(source)
  expect(result.diagnostics[0]).toMatch(/post.md.*frontmatter/)
})

test('补全无效字段时保留有效值，移除失效的关联字段和路径覆盖', async () => {
  const source = `---
title: 有效标题
description: 123
publish: '2026-02-30'
update: '2025-01-01'
tags: [Vue, '../bad']
path: /override
body: 不得覆盖正文
---
正文`
  const result = await prepareDevelopmentDocument(source, 'post.md', 'posts', today)
  expect(result.metadata).toMatchObject({ title: '有效标题', description: '', publish: today, tags: ['Vue'] })
  expect(result.metadata).not.toHaveProperty('update')
  expect(result.metadata).not.toHaveProperty('path')
  expect(result.metadata).not.toHaveProperty('body')
})
