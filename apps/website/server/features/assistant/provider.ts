import type { AssistantCredentials, AssistantSettings } from '../../../shared/assistant/settings'
import type { ModelMessage } from '../../../shared/assistant/tools'
import type { Fetch } from './network'
import { z } from 'zod'
import { AssistantError, assistantLimits } from '../../../shared/assistant/model'
import { assistantSystemPrompt, publicHttpsEndpoint } from '../../../shared/assistant/settings'
import { finalIntentSchema, toolCallSchema, toolDefinitions } from '../../../shared/assistant/tools'
import { boundedJson, withTimeout } from './network'

const usageSchema = z.object({ prompt_tokens: z.number().int().nonnegative().max(10_000_000), completion_tokens: z.number().int().nonnegative().max(10_000_000) })
const providerResponseSchema = z.object({
  choices: z.array(z.object({ finish_reason: z.enum(['stop', 'tool_calls']), message: z.object({ role: z.literal('assistant'), content: z.string().nullable().optional(), tool_calls: z.array(toolCallSchema).min(1).max(3).optional(), refusal: z.string().nullable().optional() }) })).length(1),
  usage: usageSchema.optional(),
})
export type ModelUsage = z.infer<typeof usageSchema>
const finalJsonSchema = z.toJSONSchema(finalIntentSchema, { target: 'draft-7' })
const outputInstructions = `需要工具时使用 API 的 tool_calls，不要将工具调用写进回答正文。最终回答只输出一个 JSON 对象，不加 Markdown 代码围栏，必须符合以下 JSON Schema，所有字段都必须提供；无文章或引用时用 []，无分类时用 null。\n${JSON.stringify(finalJsonSchema)}`

function finalIssueSummary(issues: readonly z.core.$ZodIssue[]): string {
  const allowedFields = new Set(['text', 'articles', 'taxonomy', 'references', 'articleId', 'sectionId'])
  const types: Record<string, string> = { string: '字符串', array: '数组', object: '对象', null: 'null' }
  return [...new Set(issues.slice(0, 8).map((issue) => {
    // Never forward Zod messages, rejected values or unknown property names.
    const path = issue.path.slice(0, 4).map(part => typeof part === 'number' ? '[]' : typeof part === 'string' && allowedFields.has(part) ? part : '字段').join('.') || '回答'
    const reason = issue.code === 'invalid_type'
      ? `缺失或类型错误，应为${types[issue.expected] ?? '规定类型'}`
      : issue.code === 'unrecognized_keys'
        ? '包含未定义字段'
        : issue.code === 'too_big'
          ? '超过长度或数量上限'
          : issue.code === 'too_small'
            ? '未达到最小长度或数量'
            : '取值或格式不符合约定'
    return `${path}：${reason}`
  }))].join('；')
}

export class ModelResponseError extends AssistantError {
  readonly adminMessage: string

  constructor(issues: readonly z.core.$ZodIssue[]) {
    super(503, 'invalid_model_response', '模型返回格式不符合要求，请稍后重试')
    this.name = 'ModelResponseError'
    this.adminMessage = `模型返回的 JSON 不符合回答约定（${finalIssueSummary(issues)}）。请检查当前模型及兼容接口的 JSON Schema 支持和 response_format 参数传递。`
  }
}

export function modelBody(settings: AssistantSettings, messages: ModelMessage[], toolChoice: 'auto' | 'required' = 'auto') {
  if (JSON.stringify(messages).length > assistantLimits.contextLength)
    throw new AssistantError(400, 'context_limit', '本次上下文过长，请缩小问题范围')
  return {
    model: settings.model,
    messages: [{ role: 'system', content: `${assistantSystemPrompt}\n交流风格：${settings.style}\n${outputInstructions}` }, ...messages],
    tools: toolDefinitions,
    tool_choice: toolChoice,
    parallel_tool_calls: false,
    response_format: { type: 'json_schema', json_schema: { name: 'blog_assistant_answer', strict: true, schema: finalJsonSchema } },
    max_tokens: assistantLimits.outputTokens,
    stream: false,
  }
}
export function modelCharge(settings: AssistantSettings, inputTokens: number, outputTokens: number): number {
  if (settings.inputPriceMicrosPerMillion === null || settings.outputPriceMicrosPerMillion === null)
    throw new AssistantError(503, 'missing_prices', '模型价格尚未配置')
  return Math.ceil(inputTokens * settings.inputPriceMicrosPerMillion / 1_000_000) + Math.ceil(outputTokens * settings.outputPriceMicrosPerMillion / 1_000_000)
}
export function modelReservation(settings: AssistantSettings, body: ReturnType<typeof modelBody>) {
  // Includes JSON framing, system text, tools and a generous protocol overhead.
  const inputBound = new TextEncoder().encode(JSON.stringify(body)).byteLength + 2048
  return modelCharge(settings, inputBound, assistantLimits.outputTokens)
}
export async function callModel(settings: AssistantSettings, credentials: AssistantCredentials, body: ReturnType<typeof modelBody>, signal: AbortSignal, fetcher: Fetch = fetch) {
  if (!settings.baseUrl || !publicHttpsEndpoint(settings.baseUrl))
    throw new AssistantError(503, 'not_configured', '模型地址尚未配置')
  return withTimeout(signal, assistantLimits.modelMs, async (activeSignal) => {
    const response = await fetcher(`${settings.baseUrl}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', 'authorization': `Bearer ${credentials.modelKey}` }, body: JSON.stringify(body), signal: activeSignal, redirect: 'error' })
    const parsed = providerResponseSchema.safeParse(await boundedJson(response))
    if (!parsed.success)
      throw new AssistantError(503, 'invalid_model_response', '模型返回内容不完整或格式不受支持，请稍后再试')
    const choice = parsed.data.choices[0]!
    const { message } = choice
    if (message.refusal)
      throw new AssistantError(400, 'model_rejected', '暂时无法回答这个问题，请换一种表达')
    if (choice.finish_reason === 'tool_calls' && message.tool_calls?.length && !message.content)
      return { kind: 'tools' as const, calls: message.tool_calls, usage: parsed.data.usage }
    if (choice.finish_reason !== 'stop' || message.tool_calls?.length || !message.content)
      throw new AssistantError(503, 'invalid_model_response', '模型返回内容不完整，请缩小问题范围后重试')
    let value: unknown
    try {
      value = JSON.parse(message.content)
    }
    catch { throw new AssistantError(503, 'invalid_model_response', '模型返回格式不正确，请重试') }
    const intent = finalIntentSchema.safeParse(value)
    if (!intent.success)
      throw new ModelResponseError(intent.error.issues)
    return { kind: 'final' as const, intent: intent.data, usage: parsed.data.usage }
  }, '模型')
}
