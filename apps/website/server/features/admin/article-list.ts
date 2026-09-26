import type { H3Event } from 'h3'
import type { AdminArticleRow, AiState } from '../../../shared/admin/articles'
import type { Draft } from '../../../shared/admin/model'
import type { SummaryRecord, SummaryState } from '../../../shared/ai/model'
import type { AudioJob, AudioKind, AudioManifest, AudioSettings } from '../../../shared/audio/model'
import type { ContentFile } from './database'
import { z } from 'zod'
import manifest from '#audio-manifest'
import { articlePublication, articleRoute, articleTitle } from '../../../shared/admin/model'
import { matchingSummary, summaryConfigHash, summaryRecordSchema } from '../../../shared/ai/model'
import { audioConfigHash, kindEnabled } from '../../../shared/audio/model'
import { comparePostOrder } from '../../../shared/content/catalog'
import { readFrontmatter } from '../../../shared/content/document'
import { summaryInput } from '../ai/content'
import { withAi } from '../ai/service'
import { withAudio } from '../audio/http'

const dates = z.object({ publish: z.string().optional().catch(undefined), update: z.string().optional().catch(undefined) })
export function audioArticleState(path: string, kind: AudioKind, snapshot: AudioManifest, settings: AudioSettings, configHash: string, jobs: AudioJob[]): AiState {
  const article = snapshot.articles.find(article => article.path === path)
  if (!article)
    return { status: 'unpublished', message: '文章上线后可生成音频。' }
  if (!kindEnabled(settings, kind) || !article[`${kind}Enabled`])
    return { status: 'disabled', message: '此音频类型已关闭，已有任务仍会保留。' }
  const related = jobs.filter(job => job.path === path && job.kind === kind)
  const job = related.find(job => job.inputHash === article.inputHash && job.configHash === configHash)
  if (!job)
    return { status: related.length ? 'stale' : 'missing', message: related.length ? '文章或音色已变化，请为上线版本生成音频。' : '' }
  return { status: job.status === 'succeeded' ? job.publication : job.status, message: job.message }
}

export async function buildArticleRows(files: ContentFile[], drafts: Draft[], summary: (source: string) => Promise<SummaryState>, audio: (path: string, kind: AudioKind) => AiState): Promise<AdminArticleRow[]> {
  const fileMap = new Map(files.map(file => [file.path, file]))
  const draftMap = new Map(drafts.map(draft => [draft.path, draft]))
  const rows = await Promise.all([...new Set([...fileMap.keys(), ...draftMap.keys()])].map(async (path) => {
    const file = fileMap.get(path)
    const draft = draftMap.get(path) ?? null
    const source = draft?.source ?? file!.source
    const publication = articlePublication(draft, file?.source ?? null)
    let metadata: z.infer<typeof dates> = {}
    try {
      metadata = dates.parse(readFrontmatter(source, path))
    }
    catch { /* Unfinished drafts remain editable. */ }
    const editedAt = publication.hasChanges ? draft?.updatedAt ?? '' : ''
    let audioSourceChanged = false
    if (file && publication.hasChanges) {
      try {
        audioSourceChanged = (await summaryInput(source)).inputHash !== (await summaryInput(file.source)).inputHash
      }
      catch { audioSourceChanged = true }
    }
    const route = articleRoute(path)
    return {
      path,
      route,
      title: articleTitle(source, path),
      publish: metadata.publish ?? '',
      update: metadata.update ?? '',
      editedAt,
      sortAt: metadata.publish ?? '',
      draft: draft ? { id: draft.id, version: draft.version } : null,
      publication,
      audioSourceChanged,
      ai: { summary: await summary(source), narration: audio(route, 'narration'), podcast: audio(route, 'podcast') },
    }
  }))
  return rows.sort((left, right) => comparePostOrder(
    { publish: left.publish, stem: left.path.replace(/\.md$/, ''), path: left.route },
    { publish: right.publish, stem: right.path.replace(/\.md$/, ''), path: right.route },
  ))
}

export async function listArticleRows(event: H3Event, files: ContentFile[], drafts: Draft[]) {
  // Read settings/cache once for the list, instead of opening a database per row.
  const summaries = await withAi(event, async (repo) => {
    const { settings } = await repo.settings()
    const configHash = await summaryConfigHash(settings)
    const records = await repo.cacheForConfig(configHash)
    return { settings, configHash, cache: new Map<string, SummaryRecord>(records.map(record => [record.inputHash, summaryRecordSchema.parse(record)])) }
  }).catch(() => null)
  const audio = await withAudio(event, async (repo) => {
    const { settings } = await repo.settings()
    const hashes = { narration: await audioConfigHash(settings, 'narration'), podcast: await audioConfigHash(settings, 'podcast') }
    return { settings, hashes, jobs: await repo.statusJobs(hashes) }
  }).catch(() => null)
  return buildArticleRows(files, drafts, async (source): Promise<SummaryState> => {
    try {
      const article = await summaryInput(source)
      if (!article.enabled || summaries?.settings.enabled === false)
        return { status: 'disabled', record: article.record, message: 'AI 摘要已关闭。' }
      if (!summaries)
        throw new Error('Settings unavailable')
      const record = matchingSummary(article.record, article.inputHash, summaries.configHash) ? article.record : summaries.cache.get(article.inputHash)
      if (record)
        return { status: 'valid', record, message: '' }
      return { status: article.record ? 'stale' : 'missing', record: article.record, message: '' }
    }
    catch { return { status: 'unavailable', record: null, message: '请检查文章标题、正文及 AI 服务设置。' } }
  }, (path, kind) => audio
    ? audioArticleState(path, kind, manifest, audio.settings, audio.hashes[kind], audio.jobs)
    : { status: 'unavailable', message: '暂时无法读取音频状态，请重试。' })
}
