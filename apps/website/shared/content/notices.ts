import { z } from 'zod'

export const noticeOptionsSchema = z.object({
  wip: z.boolean(),
  staleAfterDays: z.number().int().positive().nullable(),
})
export type NoticeOptions = z.infer<typeof noticeOptionsSchema>

export function shanghaiDay(now: Date): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)!.value).join('-')
}

export function articleNotices(post: { wip: boolean, publish: string, update?: string }, options: NoticeOptions, today: string) {
  const config = noticeOptionsSchema.parse(options)
  const maintained = post.update ?? post.publish
  const days = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${maintained}T00:00:00Z`)) / 86400000
  return {
    wip: config.wip && post.wip,
    stale: config.staleAfterDays !== null && days >= config.staleAfterDays,
    maintained,
  }
}
