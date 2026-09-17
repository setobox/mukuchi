import { z } from 'zod'

const prefix = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
export const collectionSchema = z.object({
  prefix,
  name: z.string(),
  total: z.number().int().nonnegative(),
  path: z.string().regex(/^[a-z0-9-]+$/).optional(),
  license: z.object({ name: z.string(), url: z.url().regex(/^https?:\/\//).optional() }).optional(),
})
export type IconCollection = z.infer<typeof collectionSchema>
export const manifestSchema = z.array(collectionSchema)
export const localIndexSchema = z.record(z.string(), z.number().int().nonnegative())
