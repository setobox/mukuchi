import { z } from 'zod'

const micros = z.number().int().nonnegative().safe()
export const assistantUsageSchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  limitMicros: micros.positive(),
  spentMicros: micros,
  reservedMicros: micros,
  totalSpentMicros: micros,
  resetMicros: micros,
}).strict()
export type AssistantUsage = z.infer<typeof assistantUsageSchema>
export const resetBudgetSchema = assistantUsageSchema.pick({ day: true, resetMicros: true })
