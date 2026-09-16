import type { AiSettings } from '../../../shared/ai/model.ts'
import { z } from 'zod'
import { AdminError } from '../../../shared/admin/model.ts'
import { summaryInputLimit, summaryTextSchema } from '../../../shared/ai/model.ts'
import { readBoundedStream } from '../admin/body.ts'

const responseSchema = z.object({ choices: z.array(z.object({ message: z.object({ content: z.string() }), finish_reason: z.string().nullish() })).min(1) })
export async function generateSummary(settings: AiSettings, apiKey: string, input: string, options: { fetch?: typeof fetch, signal?: AbortSignal, timeoutMs?: number } = {}) {
  if (!settings.baseUrl || !settings.model || !apiKey)
    throw new AdminError(422, '请先配置 AI 服务地址、模型和密钥')
  if (!input.trim() || Array.from(input).length > summaryInputLimit)
    throw new AdminError(422, '文章内容为空或超过 32,000 字符，请手动填写摘要')
  const request = options.fetch ?? globalThis.fetch
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController()
    const abort = () => controller.abort()
    options.signal?.addEventListener('abort', abort, { once: true })
    if (options.signal?.aborted)
      controller.abort()
    const timer = setTimeout(abort, options.timeoutMs ?? 30_000)
    let retryable = false
    try {
      const response = await request(`${settings.baseUrl}/chat/completions`, {
        method: 'POST',
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'content-type': 'application/json', 'authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model: settings.model, stream: false, messages: [{ role: 'system', content: settings.prompt }, { role: 'user', content: input }] }),
      })
      if (!response.ok) {
        retryable = response.status === 429 || response.status >= 500
        await response.body?.cancel()
        throw new AdminError(502, response.status === 401 || response.status === 403 ? 'AI 服务鉴权失败，请检查密钥及模型权限' : response.status === 429 ? 'AI 服务请求受限，请稍后重试' : 'AI 服务请求失败，请检查服务配置')
      }
      const bytes = await readBoundedStream(response.body ?? undefined, 64 * 1024)
      const parsed = responseSchema.safeParse(JSON.parse(new TextDecoder().decode(bytes)))
      if (!parsed.success || parsed.data.choices[0]!.finish_reason === 'length')
        throw new AdminError(502, 'AI 服务未返回完整的文本摘要')
      const result = summaryTextSchema.safeParse(parsed.data.choices[0]!.message.content.replace(/\s+/g, ' '))
      if (!result.success || /```|<\/?[a-z][^>]*>/i.test(result.data))
        throw new AdminError(502, 'AI 服务返回的摘要格式无效')
      return result.data
    }
    catch (error) {
      if (options.signal?.aborted)
        throw new AdminError(504, '摘要生成已超过时间预算')
      retryable ||= controller.signal.aborted || error instanceof TypeError
      if (attempt === 0 && retryable)
        continue
      if (error instanceof AdminError)
        throw error
      throw new AdminError(controller.signal.aborted ? 504 : 502, controller.signal.aborted ? 'AI 摘要生成超时，请稍后重试' : 'AI 服务响应无效或连接失败')
    }
    finally {
      clearTimeout(timer)
      options.signal?.removeEventListener('abort', abort)
    }
  }
  throw new AdminError(502, '摘要生成失败')
}
