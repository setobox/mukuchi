import { z } from 'zod'
import { articlePathSchema } from './model'

export const toolInputs = {
  get_site_info: z.object({ scope: z.enum(['site', 'author', 'all']) }).strict(),
  get_taxonomy: z.object({ kind: z.enum(['category', 'tag', 'all']) }).strict(),
  get_article: z.object({ articleId: articlePathSchema, sectionId: z.string().min(1).max(200).nullable() }).strict(),
  search_articles: z.object({ query: z.string().trim().min(1).max(200), limit: z.number().int().min(1).max(5), category: z.string().max(100).nullable(), tag: z.string().max(100).nullable() }).strict(),
  get_history: z.object({ limit: z.number().int().min(1).max(2) }).strict(),
  navigate_to_article: z.object({ articleId: articlePathSchema }).strict(),
} as const
export type ToolName = keyof typeof toolInputs
const descriptions: Record<ToolName, string> = {
  get_site_info: '获取站点和作者公开资料。',
  get_taxonomy: '获取公开文章分类和标签。',
  get_article: '读取文章正文或章节；长文仅返回明确标记的片段，不能声称全文已读。articleId 必须来自当前页面或搜索结果，sectionId 无指定时为 null。',
  search_articles: '搜索公开博客文章，返回候选项；解释细节前仍须 get_article。',
  get_history: '读取本轮上下文之前的当前会话历史，不能查询其他会话。',
  navigate_to_article: '提出打开已确定文章的意图，应用负责取得用户确认并导航。工具调用不表示跳转已完成。',
}
export const toolDefinitions = (Object.keys(toolInputs) as ToolName[]).map(name => ({
  type: 'function' as const,
  function: { name, description: descriptions[name], strict: true, parameters: z.toJSONSchema(toolInputs[name], { target: 'draft-7' }) },
}))
export const toolCallSchema = z.object({
  id: z.string().min(1).max(100).regex(/^[\w-]+$/),
  type: z.literal('function'),
  function: z.object({ name: z.enum(Object.keys(toolInputs) as [ToolName, ...ToolName[]]), arguments: z.string().max(1500) }).strict(),
}).strict()
export type ToolCall = z.infer<typeof toolCallSchema>
export const finalIntentSchema = z.object({
  text: z.string().min(1).max(1200),
  articles: z.array(articlePathSchema).max(3),
  taxonomy: z.enum(['category', 'tag', 'all']).nullable(),
  references: z.array(z.object({ articleId: articlePathSchema, sectionId: z.string().min(1).max(200).nullable() }).strict()).max(5),
}).strict()
export type FinalIntent = z.infer<typeof finalIntentSchema>

export const modelMessageSchema = z.discriminatedUnion('role', [
  z.object({ role: z.literal('user'), content: z.string() }).strict(),
  z.object({ role: z.literal('assistant'), content: z.string().nullable(), tool_calls: z.array(toolCallSchema).min(1).max(3) }).strict(),
  z.object({ role: z.literal('tool'), tool_call_id: z.string(), content: z.string() }).strict(),
])
export type ModelMessage = z.infer<typeof modelMessageSchema>
