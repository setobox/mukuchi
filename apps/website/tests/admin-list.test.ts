import type { Draft } from '../shared/admin/model'
import { expect, test } from 'vite-plus/test'
import { audioArticleState, buildArticleRows } from '../server/features/admin/article-list'
import { audioArticle } from '../server/features/audio/content'
import { filterArticleRows } from '../shared/admin/articles'
import { audioConfigHash } from '../shared/audio/model'
import { audioDatabase, audioSettings, audioSource } from './fixtures/audio'

const summary = async () => ({ status: 'missing' as const, record: null, message: '' })
const audio = () => ({ status: 'missing' as const, message: '' })
const draft: Draft = { id: crypto.randomUUID(), path: '1.a.md', source: audioSource, version: 1, publishedVersion: 0, baseHash: 'hash', updatedAt: '2026-09-20T00:00:00Z' }

test('文章行使用内容状态，打开编辑不改变排序，正文和元数据变更分开处理', async () => {
  const files = [{ path: draft.path, source: audioSource, hash: 'hash' }]
  const [before] = await buildArticleRows(files, [], summary, audio)
  const [opened] = await buildArticleRows(files, [draft], summary, audio)
  expect(opened?.sortAt).toBe(before?.sortAt)
  expect(opened?.publication.hasChanges).toBe(false)
  expect(opened?.route).toBe('/posts/a')
  const [metadata] = await buildArticleRows(files, [{ ...draft, source: audioSource.replace('原简介', '修改简介') }], summary, audio)
  expect(metadata?.publication.hasChanges).toBe(true)
  expect(metadata?.audioSourceChanged).toBe(false)
  const [body] = await buildArticleRows(files, [{ ...draft, source: `${audioSource}新正文` }], summary, audio)
  expect(body?.audioSourceChanged).toBe(true)
  expect(body?.editedAt).toBe(draft.updatedAt)
})

test('不完整草稿可列出、搜索和筛选，不要求文章达到发布标准', async () => {
  const rows = await buildArticleRows([], [{ ...draft, source: '未完成内容', baseHash: null }], summary, audio)
  expect(rows[0]?.title).toBe(draft.path)
  expect(rows[0]?.publish).toBe('')
  expect(filterArticleRows(rows, 'a.md', 'drafts', 'summary', 'missing')).toHaveLength(1)
  expect(filterArticleRows(rows, '', 'published')).toHaveLength(0)
  expect(filterArticleRows(rows, '', 'all', 'all', 'failed')).toHaveLength(0)
})

test('当前音频状态不受最近 500 条任务限制，并区分未上线、关闭、旧配置和审核状态', async () => {
  const { repo, db } = audioDatabase()
  try {
    const article = await audioArticle('1.a.md', audioSource)
    const manifest = { revision: 'current', articles: [article] }
    await repo.saveSettings(audioSettings, '', 0)
    await repo.synchronize(manifest, true)
    const job = (await repo.enqueue(article, 'podcast', audioSettings))!
    await repo.query('UPDATE audio_jobs SET created_at = ?, status = ?, publication = ? WHERE id = ?', ['2000-01-01', 'succeeded', 'review', job.id])
    for (let i = 0; i < 501; i++)
      await repo.enqueue({ ...article, path: `/posts/history-${i}` }, 'narration', audioSettings)
    expect((await repo.jobs()).some(item => item.id === job.id)).toBe(false)
    const hashes = { narration: await audioConfigHash(audioSettings, 'narration'), podcast: await audioConfigHash(audioSettings, 'podcast') }
    const jobs = await repo.statusJobs(hashes)
    expect(audioArticleState(article.path, 'podcast', manifest, audioSettings, hashes.podcast, jobs).status).toBe('review')
    expect(audioArticleState(article.path, 'podcast', manifest, audioSettings, 'new-config', jobs).status).toBe('stale')
    expect(audioArticleState(article.path, 'podcast', manifest, { ...audioSettings, enabled: false }, hashes.podcast, jobs).status).toBe('disabled')
    expect(audioArticleState('/posts/new', 'podcast', manifest, audioSettings, hashes.podcast, jobs).status).toBe('unpublished')
  }
  finally { db.close() }
})
