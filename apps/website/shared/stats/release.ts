import { z } from 'zod'

export const statsBuildSchema = z.object({ enabled: z.boolean() })
export const statsWranglerSchema = z.object({
  d1_databases: z.array(z.object({ binding: z.string(), database_id: z.string().optional() }).passthrough()),
  vars: z.record(z.string(), z.unknown()).optional(),
}).passthrough()

export function validateStatsBinding(input: { statsId: unknown, contentId: unknown }) {
  if (!z.uuid().safeParse(input.statsId).success || input.statsId === '00000000-0000-0000-0000-000000000000' || input.statsId === input.contentId)
    throw new Error('启用统计前须配置独立的真实 STATS_DB database_id')
}

export function validateStatsRelease(input: { enabled: boolean, statsId: unknown, contentId: unknown, secretNames: string[] }) {
  if (!input.enabled)
    return
  validateStatsBinding(input)
  if (!input.secretNames.includes('NUXT_STATS_HASH_SECRET'))
    throw new Error('启用统计前须配置 Worker Secret：NUXT_STATS_HASH_SECRET')
}
