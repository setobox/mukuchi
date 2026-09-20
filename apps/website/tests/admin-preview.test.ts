import type { Asset } from '../shared/admin/model'
import { expect, test } from 'vite-plus/test'
import { renderArticlePreview } from '../server/features/admin/preview'

const source = `---
title: 未保存标题
description: 原简介
publish: '2026-09-20'
tags: [Nuxt, Vue]
theme: '#ff7d36'
cover: /images/private.png
---

## 正文

当前未保存的正文。

![私有图片](/images/private.png)

\`\`\`ts [example.ts]
const message = 'hello'
\`\`\`

::callout
MDC 内容
::
`
const asset = { id: 'private-image', path: '/images/private.png' } as Asset
const missing = { status: 'missing', record: null, message: '' } as const

test('预览当前源码，保留日期、标签、MDC、代码和目录，并映射私有图片', async () => {
  const result = await renderArticlePreview(source, 'hello.md', [asset], '/blog', missing)
  expect(result.data).toMatchObject({ title: '未保存标题', description: '原简介', publish: '2026-09-20', tags: ['Nuxt', 'Vue'], theme: '#ff7d36', path: '/posts/hello', cover: '/blog/api/admin/assets/private-image' })
  const body = JSON.stringify(result.body)
  expect(body).toContain('当前未保存的正文')
  expect(body).toContain('/blog/api/admin/assets/private-image')
  expect(body).toContain('callout')
  expect(body).toContain('example.ts')
  expect(result.toc?.links[0]).toMatchObject({ id: '正文', text: '正文' })
  expect(source).toContain('cover: /images/private.png')
  expect(asset.path).toBe('/images/private.png')
})

test('未保存摘要只应用于本次预览，空摘要回退简介', async () => {
  expect((await renderArticlePreview(source, 'hello.md', [], '', missing, '还未保存的摘要')).data).toMatchObject({ description: '还未保存的摘要', summarySource: 'ai' })
  expect((await renderArticlePreview(source, 'hello.md', [], '', missing, '')).data).toMatchObject({ description: '原简介', summarySource: 'description' })
  expect((await renderArticlePreview(source.replace('title:', 'aiSummary: false\ntitle:'), 'hello.md', [], '', missing, '不会显示')).data.summarySource).toBe('description')
})

test('无效元数据返回可重试的解析错误', async () => {
  await expect(renderArticlePreview(source.replace('\'2026-09-20\'', '\'2026-02-31\''), 'hello.md', [], '', missing)).rejects.toMatchObject({ statusCode: 422 })
  await expect(renderArticlePreview(source.replace('title: 未保存标题', 'title: [broken'), 'hello.md', [], '', missing)).rejects.toMatchObject({ statusCode: 422 })
})

test('服务端高亮器应用与前台一致的主题，不依赖公开高亮接口', async () => {
  const result = await renderArticlePreview(source, 'hello.md', [], '', missing, undefined, async (code, language, theme) => {
    expect(language).toBe('ts')
    expect(theme).toEqual({ default: 'github-dark', light: 'github-light' })
    return { tree: [{ type: 'element', tagName: 'span', properties: { className: ['highlighted-token'] }, children: [{ type: 'text', value: code }] }], className: 'shiki', style: '', inlineStyle: '' }
  })
  expect(JSON.stringify(result.body)).toContain('highlighted-token')
})
