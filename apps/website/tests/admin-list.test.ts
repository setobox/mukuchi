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

test('后台按发布日期、文件名序号和规范化网址排序，无发布日期草稿排最后', async () => {
  const files = [
    { path: '0.folder/plain.md', publish: '2026-09-16' },
    { path: '1.zulu/2.two.md', publish: '2026-09-16' },
    { path: '9.alpha/02.two.md', publish: '2026-09-16' },
    { path: '0.folder/10.ten.md', publish: '2026-09-16' },
    { path: '99.folder/1.one.md', publish: '2026-09-16' },
    { path: 'new.md', publish: '2026-09-17' },
    { path: '0.old.md', publish: '2026-09-15' },
  ].map(({ path, publish }) => ({ path, source: audioSource.replace('2026-09-16', publish), hash: 'hash' }))
  const drafts = [{ ...draft, path: '0.missing.md', source: '未完成内容', baseHash: null }]
  const rows = await buildArticleRows(files, drafts, summary, audio)
  expect(rows.map(row => row.path)).toEqual([
    'new.md',
    '0.folder/10.ten.md',
    '9.alpha/02.two.md',
    '1.zulu/2.two.md',
    '99.folder/1.one.md',
    '0.folder/plain.md',
    '0.old.md',
    '0.missing.md',
  ])
  expect(rows.every(row => row.sortAt === row.publish)).toBe(true)
  expect(rows.at(-1)?.editedAt).toBe(draft.updatedAt)
})

test('修改更新日期和保存草稿不改变后台顺序，更新和保存时间仍可展示', async () => {
  const files = [
    { path: draft.path, source: audioSource, hash: 'hash' },
    { path: 'new.md', source: audioSource.replace('2026-09-16', '2026-09-17'), hash: 'hash' },
  ]
  const before = await buildArticleRows(files, [], summary, audio)
  const updatedSource = audioSource.replace('publish: 2026-09-16', 'publish: 2026-09-16\nupdate: 2026-09-26\npin: 99')
  const afterUpdate = await buildArticleRows([{ ...files[0]!, source: updatedSource }, files[1]!], [], summary, audio)
  const afterSave = await buildArticleRows(files, [{ ...draft, source: `${updatedSource}新正文`, updatedAt: '2026-09-27T12:00:00Z' }], summary, audio)
  const expected = ['new.md', draft.path]
  expect(before.map(row => row.path)).toEqual(expected)
  expect(afterUpdate.map(row => row.path)).toEqual(expected)
  expect(afterSave.map(row => row.path)).toEqual(expected)
  expect(afterSave[1]).toMatchObject({ publish: '2026-09-16', sortAt: '2026-09-16', update: '2026-09-26', editedAt: '2026-09-27T12:00:00Z' })
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
