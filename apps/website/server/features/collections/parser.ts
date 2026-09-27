import type { ResourceGroup, ResourceLink } from '#shared/collections/types'
import { z } from 'zod'

const httpUrl = z.url({ protocol: /^https?$/ })
const linkSchema = z.object({
  type: z.literal('LINK'),
  url: httpUrl,
  title: z.string().optional(),
  caption: z.object({ plainText: z.string() }).optional(),
  provider: z.object({ display: z.string().optional() }).optional(),
  faviconUrl: httpUrl.optional().catch(undefined),
})
const boardSchema = z.object({
  type: z.literal('BOARD'),
  title: z.string(),
  children: z.array(z.unknown()),
})
const detailSchema = z.object({
  ok: z.literal(true),
  data: z.object({ board: z.object({ children: z.array(z.unknown()) }) }),
})

function cleanText(value?: string): string {
  return value?.replace(/\s+/g, ' ').trim() ?? ''
}

function parseLink(input: unknown): ResourceLink | undefined {
  const result = linkSchema.safeParse(input)
  if (!result.success)
    return undefined
  const link = result.data
  return {
    title: cleanText(link.title) || cleanText(link.provider?.display) || new URL(link.url).hostname.replace(/^www\./, ''),
    description: cleanText(link.caption?.plainText),
    href: link.url,
    imageUrl: link.faviconUrl,
  }
}

export function parseMilanoteCollections(input: unknown): ResourceGroup[] {
  return detailSchema.parse(input).data.board.children.flatMap((inputBoard) => {
    const result = boardSchema.safeParse(inputBoard)
    if (!result.success)
      return []
    return [{
      title: cleanText(result.data.title),
      items: result.data.children.map(parseLink).filter((item): item is ResourceLink => item !== undefined),
    }]
  })
}
