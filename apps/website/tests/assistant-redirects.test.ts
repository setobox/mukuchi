import type { Fetch } from '../server/features/assistant/network'
import { describe, expect, test, vi } from 'vite-plus/test'
import { moderate } from '../server/features/assistant/moderation'
import { callModel, modelBody } from '../server/features/assistant/provider'
import { verifyTurnstile } from '../server/features/assistant/turnstile'
import { assistantCredentialsSchema, defaultAssistantSettings } from '../shared/assistant/settings'

const settings = { ...defaultAssistantSettings, baseUrl: 'https://model.example.com/v1', model: 'fixture' }
const credentials = assistantCredentialsSchema.parse({ modelKey: 'test-key', aliyunKeyId: 'test-id', aliyunKeySecret: 'test-secret' })
const signal = new AbortController().signal
const clients: { name: string, invoke: (fetcher: Fetch) => Promise<unknown>, success: () => Response }[] = [
  {
    name: '阿里云审核',
    invoke: fetcher => moderate('安全文本', 'input', settings, credentials, signal, fetcher),
    success: () => Response.json({ Code: 200, Data: { Suggestion: 'pass', Detail: [{ Type: 'contentModeration', Suggestion: 'pass' }, { Type: 'promptAttack', Suggestion: 'pass' }] } }),
  },
  {
    name: '模型 SSE 请求',
    invoke: fetcher => callModel(settings, credentials, modelBody(settings, [{ role: 'user', content: '你好' }]), signal, fetcher, () => {}),
    success: () => {
      const intent = { text: '你好', articles: [], references: [], taxonomy: null }
      return new Response(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: JSON.stringify(intent) }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } })
    },
  },
  {
    name: 'Turnstile 验证',
    invoke: fetcher => verifyTurnstile({ secret: 'test-secret', token: 'test-token', hostname: 'blog.example.com', ip: 'unknown' }, signal, fetcher),
    success: () => Response.json({ success: true, hostname: 'blog.example.com', action: 'assistant', challenge_ts: new Date().toISOString() }),
  },
]

// Reproduce the production runtime's rejection before a request reaches upstream.
function workerFetch(response: Response) {
  return vi.fn<Fetch>(async (_url, init) => {
    if (init?.redirect === 'error')
      throw new TypeError('Invalid redirect value, must be one of "follow" or "manual"')
    if (init?.redirect !== 'manual')
      throw new Error('Test upstream would forward credentials to the redirect target')
    return response
  })
}

describe.each(clients)('$name', ({ invoke, success }) => {
  test('兼容 Workers 的重定向模式，正常响应可用', async () => {
    const fetcher = workerFetch(success())
    await invoke(fetcher)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  test.each([301, 302, 303, 307, 308])('拒绝 %s，即使响应正文伪装为审核通过、验证码通过或有效 SSE，也不跟随或重试', async (status) => {
    const reply = success()
    reply.headers.set('location', 'https://other.example.com/collect')
    const fetcher = workerFetch(new Response(reply.body, { status, headers: reply.headers }))
    await expect(invoke(fetcher)).rejects.toMatchObject({ statusCode: 503 })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
