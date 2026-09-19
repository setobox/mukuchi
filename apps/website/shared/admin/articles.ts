import type { SummaryState } from '../ai/model'
import type { ArticlePublicationState } from './model'

export const aiTypes = ['summary', 'narration', 'podcast'] as const
export type AiType = typeof aiTypes[number]
export const aiTypeLabels: Record<AiType, string> = { summary: 'AI 摘要', narration: 'AI 朗读', podcast: '双人播客' }
export const aiStatusLabels = {
  disabled: '已关闭',
  missing: '未生成',
  valid: '有效',
  stale: '已过期',
  unavailable: '暂不可用',
  unpublished: '待上线',
  queued: '排队中',
  running: '生成中',
  public: '已公开',
  review: '待审核',
  private: '未公开',
  hidden: '已隐藏',
  failed: '失败',
  unknown: '需要处理',
  cancelled: '已取消',
} as const
export type AiStatus = keyof typeof aiStatusLabels
export interface AiState { status: AiStatus, message: string }
export interface AdminArticleRow {
  path: string
  route: string
  title: string
  publish: string
  update: string
  editedAt: string
  sortAt: string
  draft: { id: string, version: number } | null
  publication: ArticlePublicationState
  audioSourceChanged: boolean
  ai: { summary: SummaryState, narration: AiState, podcast: AiState }
}
export function aiStatusTone(status: AiStatus): 'success' | 'warn' | 'error' | 'info' | 'current' {
  if (status === 'valid' || status === 'public')
    return 'success'
  if (['failed', 'unknown', 'unavailable'].includes(status))
    return 'error'
  if (['stale', 'review'].includes(status))
    return 'warn'
  if (status === 'queued' || status === 'running')
    return 'info'
  return 'current'
}
export function filterArticleRows(rows: AdminArticleRow[], query: string, publication = 'all', type = 'all', status = 'all') {
  const needle = query.trim().toLocaleLowerCase()
  return rows.filter(row => `${row.title} ${row.path}`.toLocaleLowerCase().includes(needle)
    && (publication === 'all' || (publication === 'drafts' ? row.publication.hasChanges : row.publication.published))
    && (status === 'all' || (type === 'all' ? aiTypes : [type as AiType]).some(kind => row.ai[kind]?.status === status)))
}
