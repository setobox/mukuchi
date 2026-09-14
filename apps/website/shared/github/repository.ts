import { z } from 'zod'

export const repositoryIdSchema = z.string()
  .regex(/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?\/[\w.-]{1,100}$/i)
  .refine(value => !['.', '..'].includes(value.split('/')[1]!))

export interface RepositoryCardData {
  repo: string
  avatar: string | null
  description: string | null
  stars: number | null
  forks: number | null
  license: string | null
  language: string | null
}
export type RepositorySnapshots = Record<string, RepositoryCardData>

export function emptyRepository(repo: string): RepositoryCardData {
  return { repo, avatar: null, description: null, stars: null, forks: null, license: null, language: null }
}

const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })
const full = new Intl.NumberFormat('en-US')
export function repositoryCount(value: number | null) {
  return value === null ? '-' : compact.format(value)
}
export function repositoryCountLabel(label: string, value: number | null) {
  return `${label}：${value === null ? '暂无数据' : full.format(value)}`
}
