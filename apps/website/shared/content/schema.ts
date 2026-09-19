import { z } from 'zod'
import { summaryRecordSchema } from '../ai/model.ts'
import { isTaxonomyName } from './taxonomy.ts'

export const themeColors = [
  '#ff4b4b',
  '#ff7d36',
  '#ffa828',
  '#ffcc2a',
  '#f9f640',
  '#b7ff54',
  '#8dff55',
  '#00ffaa',
  '#26f2d5',
  '#05dbe9',
  '#33b3f1',
  '#4d9cff',
  '#7c85ff',
  '#a369ff',
  '#c06ddf',
  '#e962bf',
] as const

// Keep the collection shape JSON-schema compatible; calendar and cross-field
// checks run against the original frontmatter at the import boundary.
export const postFields = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  aiSummary: z.boolean().default(true),
  audio: z.object({ narration: z.boolean().optional(), podcast: z.boolean().optional() }).optional(),
  summary: summaryRecordSchema.optional().catch(undefined),
  summarySource: z.enum(['ai', 'description']).default('description'),
  publish: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  update: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  cover: z.string().optional(),
  tags: z.array(z.string().min(1)).default([]),
  categories: z.array(z.string().min(1)).default([]),
  pin: z.number().int().nonnegative().default(0),
  wip: z.boolean().default(false),
  theme: z.enum(themeColors).default('#a369ff'),
})
export const aboutFields = z.object({ title: z.string().min(1), description: z.string().min(1) })
export type PostMeta = z.infer<typeof postFields>
export type PostSummary = Omit<PostMeta, 'aiSummary' | 'summary' | 'summarySource'> & { path: string }

export function isCalendarDate(value: string): boolean {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day || month > 12)
    return false
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  return day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]!
}

export const postSchema = postFields
  .superRefine((data, ctx) => {
    for (const field of ['title', 'description'] as const) {
      if (!data[field].trim())
        ctx.addIssue({ code: 'custom', path: [field], message: '不能为空' })
    }
    for (const field of ['publish', 'update'] as const) {
      if (data[field] && !isCalendarDate(data[field]))
        ctx.addIssue({ code: 'custom', path: [field], message: '必须是有效的 YYYY-MM-DD 日期' })
    }
    if (data.update && data.update < data.publish)
      ctx.addIssue({ code: 'custom', path: ['update'], message: '不能早于发布日期' })
    for (const field of ['tags', 'categories'] as const) {
      data[field].forEach((value, index) => {
        if (!isTaxonomyName(value)) {
          ctx.addIssue({
            code: 'custom',
            path: [field, index],
            message: '名称不能为空，不能包含路径分隔符、控制字符、无效 Unicode，或仅为 .、..',
          })
        }
      })
    }
    if (data.cover && !/^(?:https?:\/\/\S+|\/(?!\/)[^\s\\]*)$/.test(data.cover)) {
      ctx.addIssue({
        code: 'custom',
        path: ['cover'],
        message: '使用 HTTP(S) 地址或以 / 开头的站内图片地址',
      })
    }
  })
  .transform(data => ({
    ...data,
    title: data.title.trim(),
    description: data.description.trim(),
    tags: [...new Set(data.tags.map(tag => tag.trim()))],
    categories: [...new Set(data.categories.map(category => category.trim()))],
  }))
