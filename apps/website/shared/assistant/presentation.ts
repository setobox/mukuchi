import { z } from 'zod'
import { assistantLimits } from './limits'
import { articleImageSchema, articlePathSchema } from './paths'

export const sourceIdsSchema = z.array(z.string().min(1).max(720)).max(8)
export const iconSchema = z.enum(['box', 'bot', 'cloud', 'laptop', 'check', 'workflow', 'message', 'book', 'code', 'layers'])
const caption = z.string().max(1000)
const base = { title: z.string().min(1).max(160), summary: caption, sourceIds: sourceIdsSchema }
const item = { title: z.string().min(1).max(160), description: caption, icon: iconSchema }
export const architectureSchema = z.object({
  type: z.literal('architecture'),
  ...base,
  nodes: z.array(z.object({ id: z.string().regex(/^[\w-]{1,40}$/), label: z.string().min(1).max(160), description: caption, icon: iconSchema }).strict()).min(1).max(12),
  edges: z.array(z.object({ from: z.string().max(40), to: z.string().max(40), label: z.string().max(100) }).strict()).max(16),
}).strict()
export const checklistSchema = z.object({ type: z.literal('checklist'), ...base, items: z.array(z.object({ ...item, tone: z.enum(['positive', 'neutral', 'warning']) }).strict()).min(1).max(8) }).strict()
export const comparisonSchema = z.object({ type: z.literal('comparison'), ...base, items: z.array(z.object({ ...item, badge: z.string().max(60), points: z.array(z.string().max(300)).max(6) }).strict()).min(2).max(4) }).strict()
export const mediaSchema = z.object({ type: z.literal('media'), ...base, articleId: articlePathSchema, image: articleImageSchema.optional() }).strict()
export const workflowSchema = z.object({
  type: z.literal('workflow'),
  ...base,
  steps: z.array(z.object({ label: z.string().min(1).max(160), state: z.enum(['done', 'active', 'pending']) }).strict()).min(1).max(8),
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().min(1).max(400) }).strict()).max(8),
  current: z.string().max(160),
}).strict()
export const htmlSchema = z.object({ type: z.literal('html'), ...base, html: z.string().min(1).max(assistantLimits.htmlBytes), css: z.string().max(assistantLimits.cssBytes) }).strict()
export const presentationSchemas = [architectureSchema, checklistSchema, comparisonSchema, mediaSchema, workflowSchema, htmlSchema] as const
export const presentationSchema = z.discriminatedUnion('type', presentationSchemas)
export type PresentationBlock = z.infer<typeof presentationSchema>
export const presentationIcons: Record<z.infer<typeof iconSchema>, string> = {
  box: 'i-lucide-box',
  bot: 'i-lucide-bot',
  cloud: 'i-lucide-cloud',
  laptop: 'i-lucide-laptop',
  check: 'i-lucide-circle-check',
  workflow: 'i-lucide-workflow',
  message: 'i-lucide-messages-square',
  book: 'i-lucide-book-open',
  code: 'i-lucide-code',
  layers: 'i-lucide-layers',
}
export function presentationText(block: PresentationBlock): string {
  const details = block.type === 'architecture'
    ? block.nodes.map(node => `${node.label} ${node.description}`).join('\n')
    : block.type === 'checklist' || block.type === 'comparison'
      ? block.items.map(item => `${item.title} ${item.description}${'points' in item ? ` ${item.points.join(' ')}` : ''}`).join('\n')
      : block.type === 'workflow' ? [...block.steps.map(step => step.label), ...block.messages.map(message => message.text), block.current].join('\n') : ''
  return [block.title, block.summary, details].filter(Boolean).join('\n')
}
