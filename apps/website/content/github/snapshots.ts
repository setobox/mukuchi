import type { RepositoryCardData, RepositorySnapshots } from '../../shared/github/repository'
import { z } from 'zod'
import { emptyRepository, repositoryIdSchema } from '../../shared/github/repository'

const publicRepositorySchema = z.object({
  private: z.literal(false),
  full_name: repositoryIdSchema,
  owner: z.object({ avatar_url: z.string().url() }),
  description: z.string().nullable(),
  stargazers_count: z.number().int().nonnegative(),
  forks_count: z.number().int().nonnegative(),
  license: z.object({ spdx_id: z.string().nullable() }).nullable(),
  language: z.string().nullable(),
})

export function publicRepository(value: unknown): RepositoryCardData {
  const data = publicRepositorySchema.parse(value)
  const avatar = new URL(data.owner.avatar_url)
  return {
    repo: data.full_name,
    avatar: avatar.protocol === 'https:' && avatar.hostname === 'avatars.githubusercontent.com' ? avatar.href : null,
    description: data.description?.trim() || null,
    stars: data.stargazers_count,
    forks: data.forks_count,
    license: data.license?.spdx_id && data.license.spdx_id !== 'NOASSERTION' ? data.license.spdx_id : null,
    language: data.language?.trim() || null,
  }
}

export interface SnapshotOptions {
  fetch: typeof globalThis.fetch
  warn: (message: string) => void
  token?: string
}

// Session-local state: production builds and dev restarts always start fresh.
export function createSnapshotCollector(options: SnapshotOptions) {
  const saved = new Map<string, RepositoryCardData>()
  let limited = false
  return async (repos: string[]): Promise<RepositorySnapshots> => {
    const result: RepositorySnapshots = {}
    for (const repo of repos) {
      repositoryIdSchema.parse(repo)
      const key = repo.toLowerCase()
      if (!saved.has(key)) {
        let snapshot = emptyRepository(repo)
        if (limited) {
          options.warn(`${repo}：GitHub 已限流，使用 - 占位`)
        }
        else {
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 8000)
          try {
            const headers: Record<string, string> = {
              'Accept': 'application/vnd.github+json',
              'User-Agent': 'mukuchi-build',
              'X-GitHub-Api-Version': '2022-11-28',
            }
            if (options.token)
              headers.Authorization = `Bearer ${options.token}`
            const response = await options.fetch(`https://api.github.com/repos/${repo}`, { headers, signal: controller.signal, redirect: 'error' })
            limited = response.status === 429 || (response.status === 403 && (response.headers.get('x-ratelimit-remaining') === '0' || response.headers.has('retry-after')))
            if (!response.ok) {
              // Some secondary-limit responses omit rate-limit headers.
              if (response.status === 403) {
                const body: unknown = await response.json().catch(() => null)
                const message = z.object({ message: z.string() }).safeParse(body)
                limited ||= message.success && /rate limit|abuse/i.test(message.data.message)
              }
              options.warn(`${repo}：${limited ? 'GitHub 限流' : `GitHub HTTP ${response.status}`}，使用 - 占位`)
            }
            else {
              const body: unknown = await response.json()
              snapshot = publicRepository(body)
            }
          }
          catch {
            // Never log response bodies, request headers, or raw errors containing credentials.
            options.warn(`${repo}：${controller.signal.aborted ? '请求超过 8 秒' : '请求失败或公开仓库数据无效'}，使用 - 占位`)
          }
          finally {
            clearTimeout(timeout)
          }
        }
        saved.set(key, snapshot)
      }
      result[key] = saved.get(key)!
    }
    return result
  }
}
