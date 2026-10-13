import type { ResponseToolItem, toolCallSchema } from '../../../shared/assistant/tools'
import type { modelBody, ModelChunk } from './provider'
import { z } from 'zod'
import { AssistantError, assistantLimits } from '../../../shared/assistant/model'
import { readSse } from '../../../shared/assistant/stream'
import { responseToolItemSchema } from '../../../shared/assistant/tools'

type ChatBody = ReturnType<typeof modelBody>

export function responsesBody(body: ChatBody) {
  const input = body.messages.flatMap((message): Record<string, unknown>[] => {
    if (message.role === 'system')
      return []
    if (message.role === 'tool')
      return [{ type: 'function_call_output', call_id: message.tool_call_id, output: message.content }]
    if (message.role === 'assistant') {
      return message.responseItems ?? message.tool_calls.map(call => ({ type: 'function_call', call_id: call.id, name: call.function.name, arguments: call.function.arguments }))
    }
    return [{ role: 'user', content: message.content }]
  })
  return {
    model: body.model,
    instructions: body.messages.filter(message => message.role === 'system').map(message => message.content).join('\n'),
    input,
    tools: body.tools.map(tool => ({ type: tool.type, ...tool.function })),
    tool_choice: body.tool_choice,
    parallel_tool_calls: body.parallel_tool_calls,
    text: { format: { type: 'json_schema', ...body.response_format.json_schema } },
    max_output_tokens: body.max_tokens,
    stream: body.stream,
    store: false,
    include: ['reasoning.encrypted_content'],
  }
}

const messageSchema = z.object({
  type: z.literal('message'),
  role: z.literal('assistant'),
  status: z.literal('completed').optional(),
  content: z.array(z.discriminatedUnion('type', [
    z.object({ type: z.literal('output_text'), text: z.string().max(assistantLimits.bodyBytes) }),
    z.object({ type: z.literal('refusal'), refusal: z.string() }),
  ])).max(20),
})
const completedSchema = z.object({
  status: z.literal('completed'),
  output: z.array(z.union([messageSchema, responseToolItemSchema])).max(16),
  usage: z.object({ input_tokens: z.number().int().nonnegative().max(10_000_000), output_tokens: z.number().int().nonnegative().max(10_000_000) }).nullable().optional(),
})

function invalid(message = 'Responses 返回的结构无效，请检查接口协议与模型支持'): never {
  throw new AssistantError(503, 'invalid_model_response', message)
}

function rejected(): never {
  throw new AssistantError(400, 'model_rejected', '暂时无法回答这个问题，请换一种表达')
}

/** The completed snapshot is authoritative; partial tool arguments never execute. */
export function responsesResult(value: unknown) {
  const parsed = completedSchema.safeParse(value)
  if (!parsed.success)
    return invalid()
  const responseItems: ResponseToolItem[] = []
  const calls: z.infer<typeof toolCallSchema>[] = []
  let content = ''
  for (const item of parsed.data.output) {
    if (item.type === 'message') {
      for (const part of item.content) {
        if (part.type === 'refusal')
          rejected()
        content += part.text
      }
    }
    else {
      if (item.status && item.status !== 'completed')
        invalid('Responses 返回了未完成的工具或推理项目')
      responseItems.push(item)
      if (item.type === 'function_call')
        calls.push({ id: item.call_id, type: 'function', function: { name: item.name, arguments: item.arguments } })
    }
  }
  if (calls.length > 3 || new Set(calls.map(call => call.id)).size !== calls.length || (calls.length && content.trim()) || (!calls.length && !content))
    invalid('Responses 未返回完整的结构化回答或有效工具调用')
  const usage = parsed.data.usage ? { prompt_tokens: parsed.data.usage.input_tokens, completion_tokens: parsed.data.usage.output_tokens } : undefined
  return { content, calls, responseItems, usage }
}

const eventSchema = z.object({ type: z.string() })
const textDeltaSchema = z.object({ delta: z.string(), output_index: z.number().int().nonnegative(), content_index: z.number().int().nonnegative() })
const completeEventSchema = z.object({ response: z.unknown() })

export async function* readResponses(body: ReadableStream<Uint8Array>, signal: AbortSignal, frame: (data: string) => void, remember: (items: ResponseToolItem[]) => void): AsyncGenerator<ModelChunk | '[DONE]'> {
  let content = ''
  for await (const data of readSse(body, signal, assistantLimits.bodyBytes)) {
    frame(data)
    if (data === '[DONE]')
      invalid('Responses 在 response.completed 之前中断')
    const value: unknown = JSON.parse(data)
    const event = eventSchema.parse(value)
    if (event.type === 'response.failed' || event.type === 'error')
      invalid('Responses 在生成过程中返回失败，请检查模型服务')
    if (event.type === 'response.incomplete')
      invalid('Responses 生成未完成，可能达到输出限制，请缩小问题范围后重试')
    if (event.type === 'response.refusal.delta' || event.type === 'response.refusal.done')
      rejected()
    if (event.type === 'response.output_text.delta') {
      const delta = textDeltaSchema.parse(value)
      content += delta.delta
      yield { choices: [{ index: 0, delta: { content: delta.delta } }] }
    }
    else if (event.type === 'response.completed') {
      const result = responsesResult(completeEventSchema.parse(value).response)
      if (content && content !== result.content)
        invalid('Responses 最终正文与流式增量不一致')
      remember(result.responseItems)
      // Some compatible gateways only emit the final snapshot.
      yield {
        choices: [{ index: 0, delta: {
          ...(!content && result.content ? { content: result.content } : {}),
          ...(result.calls.length ? { tool_calls: result.calls.map((call, index) => ({ index, ...call })) } : {}),
        }, finish_reason: result.calls.length ? 'tool_calls' : 'stop' }],
        usage: result.usage,
      }
      yield '[DONE]'
      return
    }
    else {
      // Lifecycle, reasoning, and function argument events are progress only.
      // Tool calls are validated from response.completed before execution.
      yield { choices: [] }
    }
  }
  invalid('Responses 流意外结束，未收到 response.completed')
}
