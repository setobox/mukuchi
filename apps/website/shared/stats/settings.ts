import { z } from 'zod'

export const statsSettingsSchema = z.object({ enabled: z.boolean(), version: z.number().int().positive() }).strict()
export type StatsSettings = z.infer<typeof statsSettingsSchema>
