import type { AssistantCredentials, AssistantSettings } from '../../../shared/assistant/settings'
import type { FinalIntent, IntentBlock, ModelMessage, RichIntent, ToolCall } from '../../../shared/assistant/tools'
import type { Fetch } from './network'
import { JSONParser } from '@streamparser/json'
import { z } from 'zod'
import { AssistantError, assistantLimits } from '../../../shared/assistant/model'
import { assistantSystemPrompt, publicHttpsEndpoint } from '../../../shared/assistant/settings'
import { readSse, SseProtocolError } from '../../../shared/assistant/stream'
import { finalIntentSchema, intentBlockSchema, richIntentSchema, toolCallSchema, toolDefinitions } from '../../../shared/assistant/tools'
import { boundedJson, readBoundedJson, UpstreamResponseError, withTimeout } from './network'

const usageSchema = z.object({ prompt_tokens: z.number().int().nonnegative().max(10_000_000), completion_tokens: z.number().int().nonnegative().max(10_000_000) })
const providerResponseSchema = z.object({
  choices: z.array(z.object({ finish_reason: z.enum(['stop', 'tool_calls']), message: z.object({ role: z.literal('assistant'), content: z.string().nullable().optional(), tool_calls: z.array(toolCallSchema).min(1).max(3).optional(), refusal: z.string().nullable().optional() }) })).length(1),
  usage: usageSchema.optional(),
})
export type ModelUsage = z.infer<typeof usageSchema>
const finalJsonSchema = z.toJSONSchema(richIntentSchema, {
  target: 'draft-7',
  override: ({ jsonSchema }) => {
    // Strict Structured Outputs supports anyOf. Unique type literals keep the
    // block alternatives mutually exclusive; runtime Zod validation stays strict.
    if (jsonSchema.oneOf) {
      jsonSchema.anyOf = jsonSchema.oneOf
      delete jsonSchema.oneOf
    }
  },
})
const outputInstructions = '需要工具时使用 API 的 tool_calls，不要将工具调用写进回答正文。最终回答只输出一个 JSON 对象，不加 Markdown 代码围栏，遵循 response_format 中的 JSON Schema，所有字段都必须提供；无文章或引用时用 []，无分类时用 null。'
const presentationInstructions = 'blocks 按阅读顺序混合 text 和展示块。text 每块一个段落，type 写在 text 前。有文章依据的段落 sourceIds 只能使用 get_article 返回的 sourceId，无来源用 []。优先用 architecture 架构/分支图、checklist 结论清单、comparison 方案对比、media 文章图文、workflow 流程与对话并排。架构节点 ID 唯一、连线无环。media 仅给已读取的 articleId，图片由服务端提供。仅当模板不合适才用 html，html 只用语义 HTML 与 class，样式放 css；禁止脚本、事件、表单、链接、图片、嵌入、外部资源、CSS @规则及 url()。CSS 使用 --color-text、--color-muted、--color-border、--color-surface、--color-accent、--color-success 等变量，适应窄屏；summary 必须提供清楚的纯文字替代。不要为简短回答强加图表。suggestions 提供 0 至 3 个相关、简短、可独立提问的后续问题。'

function finalIssueSummary(issues: readonly z.core.$ZodIssue[]): string {
  const allowedFields = new Set(['text', 'blocks', 'type', 'sourceIds', 'suggestions', 'html', 'css', 'articles', 'taxonomy', 'references', 'articleId', 'sectionId'])
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

export class ModelTimeoutError extends AssistantError {
  readonly adminMessage: string
  constructor(receivedHeaders: boolean, receivedFrames: number) {
    const seconds = assistantLimits.modelMs / 1000
    super(504, 'upstream_timeout', receivedHeaders ? `模型响应超过 ${seconds} 秒未完成，请稍后重试` : `模型服务超过 ${seconds} 秒未返回响应，请稍后重试`)
    this.adminMessage = receivedHeaders
      ? `模型已返回 HTTP 响应头，已解析 ${receivedFrames} 个流式事件，但在 ${seconds} 秒内未完成。本次回答未保存为完成历史。`
      : `模型服务在 ${seconds} 秒内未返回 HTTP 响应头，尚未进入回复解析。请检查服务端到模型接口的网络、代理与供应商状态。`
  }
}

export function modelBody(settings: AssistantSettings, messages: ModelMessage[], toolChoice: 'auto' | 'required' = 'auto') {
  if (JSON.stringify(messages).length > assistantLimits.contextLength)
    throw new AssistantError(400, 'context_limit', '本次上下文过长，请缩小问题范围')
  return {
    model: settings.model,
    messages: [{ role: 'system', content: `${assistantSystemPrompt}\n交流风格：${settings.style}\n${presentationInstructions}\n${outputInstructions}` }, ...messages],
    tools: toolDefinitions,
    tool_choice: toolChoice,
    parallel_tool_calls: false,
    response_format: { type: 'json_schema', json_schema: { name: 'blog_assistant_answer', strict: true, schema: finalJsonSchema } },
    max_tokens: assistantLimits.outputTokens,
    stream: true,
  }
}
export type ModelEvent = { type: 'text', index: number, text: string } | { type: 'block', index: number, block: IntentBlock } | { type: 'retry', attempt: number } | { type: 'stream' } | { type: 'structure' }
export type ModelObserver = (event: ModelEvent) => void | Promise<void>
export type ModelResult = { kind: 'tools', calls: ToolCall[], usage?: ModelUsage } | { kind: 'final', intent: FinalIntent | RichIntent, usage?: ModelUsage }

function parseIntent(content: string): FinalIntent | RichIntent {
  let value: unknown
  try {
    value = JSON.parse(content)
  }
  catch { throw new AssistantError(503, 'invalid_model_response', '模型返回格式不正确，请重试') }
  const rich = typeof value === 'object' && value !== null && 'blocks' in value
  const parsed = rich ? richIntentSchema.safeParse(value) : finalIntentSchema.safeParse(value)
  if (!parsed.success)
    throw new ModelResponseError(parsed.error.issues)
  return parsed.data
}

const chunkSchema = z.object({
  choices: z.array(z.object({
    index: z.literal(0),
    finish_reason: z.string().nullable().optional(),
    delta: z.object({
      content: z.string().nullable().optional(),
      refusal: z.string().nullable().optional(),
      tool_calls: z.array(z.object({ index: z.number().int().min(0).max(2), id: z.string().optional(), type: z.literal('function').optional(), function: z.object({ name: z.string().optional(), arguments: z.string().optional() }).optional() })).max(3).optional(),
    }),
  })).max(1),
  usage: usageSchema.nullable().optional(),
})

async function streamModel(response: Response, signal: AbortSignal, observer: ModelObserver): Promise<ModelResult> {
  if (!response.body)
    throw new AssistantError(503, 'invalid_model_response', '模型没有返回流式响应')
  const parser = new JSONParser({ emitPartialTokens: true, emitPartialValues: true, paths: ['$.blocks.*', '$.blocks.*.type', '$.blocks.*.text', '$.text'] })
  const lengths = new Map<number, number>()
  const updates: ModelEvent[] = []
  parser.onValue = ({ key, value, partial, stack, parent }) => {
    if (key === 'type' && !partial && value !== 'text' && stack.length === 3)
      updates.push({ type: 'structure' })
    // JSON object keys are unordered. Some compatible providers send text before
    // type; only text blocks have $.blocks[i].text, so this path can stream safely.
    const textBlock = stack.length === 3 && parent && !Array.isArray(parent) && (parent.type === undefined || parent.type === 'text')
    if (key === 'text' && typeof value === 'string' && (stack.length === 1 || textBlock)) {
      const index = stack.length === 1 ? 0 : stack.at(-1)?.key
      if (typeof index !== 'number' || index >= assistantLimits.modelBlocks || value.length > assistantLimits.visibleLength)
        throw new AssistantError(503, 'output_limit', '回答内容超过限制')
      const offset = lengths.get(index) ?? 0
      if (value.length > offset) {
        updates.push({ type: 'text', index, text: value.slice(offset) })
        lengths.set(index, value.length)
      }
    }
    if (typeof key === 'number' && stack.length === 2) {
      if (!partial)
        updates.push({ type: 'block', index: key, block: intentBlockSchema.parse(value) })
    }
  }
  const calls = new Map<number, { id: string, type: 'function', function: { name: string, arguments: string } }>()
  let content = ''
  let finish: string | null = null
  let done = false
  let usage: ModelUsage | undefined
  for await (const data of readSse(response.body, signal, assistantLimits.bodyBytes)) {
    if (data === '[DONE]') {
      done = true
      break
    }
    const chunk = chunkSchema.parse(JSON.parse(data))
    await observer({ type: 'stream' })
    usage = chunk.usage ?? usage
    const choice = chunk.choices[0]
    if (!choice)
      continue
    if (finish && (choice.delta.content || choice.delta.tool_calls?.length))
      throw new AssistantError(503, 'invalid_model_response', '模型在结束后继续返回内容')
    if (choice.delta.refusal)
      throw new AssistantError(400, 'model_rejected', '暂时无法回答这个问题，请换一种表达')
    if (choice.delta.content) {
      content += choice.delta.content
      try {
        parser.write(choice.delta.content)
      }
      catch (error) {
        if (error instanceof AssistantError)
          throw error
        throw new AssistantError(503, 'invalid_model_response', '模型返回的结构无效，请重试')
      }
      for (const update of updates.splice(0)) {
        signal.throwIfAborted()
        await observer(update)
      }
    }
    for (const delta of choice.delta.tool_calls ?? []) {
      const call = calls.get(delta.index) ?? { id: '', type: 'function' as const, function: { name: '', arguments: '' } }
      call.id += delta.id ?? ''
      call.function.name += delta.function?.name ?? ''
      call.function.arguments += delta.function?.arguments ?? ''
      if (call.id.length > 100 || call.function.name.length > 100 || call.function.arguments.length > 1500)
        throw new AssistantError(503, 'invalid_tool', '工具参数超过限制')
      calls.set(delta.index, call)
    }
    finish = choice.finish_reason ?? finish
  }
  if (!done || !finish)
    throw new AssistantError(503, 'invalid_model_response', '模型响应已中断，请重试')
  if (finish === 'tool_calls' && calls.size && !content.trim())
    return { kind: 'tools', calls: [...calls.entries()].sort(([a], [b]) => a - b).map(([, call]) => toolCallSchema.parse(call)), usage }
  if (finish !== 'stop' || calls.size || !content)
    throw new AssistantError(503, 'invalid_model_response', '模型返回内容不完整，请缩小问题范围后重试')
  if (!parser.isEnded) {
    try {
      parser.end()
    }
    catch { throw new AssistantError(503, 'invalid_model_response', '模型返回的 JSON 不完整，请重试') }
  }
  return { kind: 'final', intent: parseIntent(content), usage }
}

async function retryDelay(ms: number, signal: AbortSignal) {
  signal.throwIfAborted()
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', abort)
    const timer = setTimeout(() => {
      cleanup()
      resolve()
    }, ms)
    function abort() {
      clearTimeout(timer)
      cleanup()
      reject(signal.reason)
    }
    signal.addEventListener('abort', abort, { once: true })
  })
}

export async function callModel(settings: AssistantSettings, credentials: AssistantCredentials, body: ReturnType<typeof modelBody>, signal: AbortSignal, fetcher: Fetch = fetch, observer?: ModelObserver): Promise<ModelResult> {
  if (!settings.baseUrl || !publicHttpsEndpoint(settings.baseUrl))
    throw new AssistantError(503, 'not_configured', '模型地址尚未配置')
  let received = false
  const notify: ModelObserver = async (event) => {
    if (event.type !== 'retry' && event.type !== 'stream')
      received = true
    await observer?.(event)
  }
  for (let attempt = 0; ; attempt++) {
    let receivedHeaders = false
    let receivedFrames = 0
    try {
      return await withTimeout(signal, assistantLimits.modelMs, async (activeSignal) => {
        const response = await fetcher(`${settings.baseUrl}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', 'authorization': `Bearer ${credentials.modelKey}` }, body: JSON.stringify(body), signal: activeSignal, redirect: 'error' })
        receivedHeaders = true
        if (!response.ok && !response.redirected) {
          const value = await readBoundedJson(response, 8192).catch(() => null)
          const parsed = z.object({ error: z.object({ code: z.string().regex(/^[\w.-]{1,100}$/).optional() }) }).safeParse(value)
          const requestId = z.string().regex(/^[\w.-]{1,150}$/).safeParse(response.headers.get('x-request-id'))
          throw new UpstreamResponseError(response.status, parsed.success ? parsed.data.error.code : undefined, requestId.success ? requestId.data : undefined)
        }
        if (response.headers.get('content-type')?.includes('text/event-stream')) {
          try {
            return await streamModel(response, activeSignal, async (event) => {
              if (event.type === 'stream')
                receivedFrames++
              await notify(event)
            })
          }
          catch (error) {
            if (error instanceof z.ZodError || error instanceof SyntaxError || error instanceof SseProtocolError)
              throw new AssistantError(503, 'invalid_model_response', '模型返回的流式结构无效，请重试')
            throw error
          }
        }
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
        return { kind: 'final' as const, intent: parseIntent(message.content), usage: parsed.data.usage }
      }, '模型')
    }
    catch (error) {
      if (error instanceof AssistantError && error.code === 'upstream_timeout')
        throw new ModelTimeoutError(receivedHeaders, receivedFrames)
      const retryable = error instanceof UpstreamResponseError ? error.upstreamStatus === 429 || [500, 502, 503, 504].includes(error.upstreamStatus) : error instanceof AssistantError && error.code === 'upstream_unavailable'
      if (!observer || received || !retryable || attempt >= 2 || signal.aborted)
        throw error
      await notify({ type: 'retry', attempt: attempt + 1 })
      await retryDelay(1000 * (attempt + 1), signal)
    }
  }
}
