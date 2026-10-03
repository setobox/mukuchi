import type { Fetch } from '../server/features/assistant/network'
import { describe, expect, test, vi } from 'vite-plus/test'
import { aliyunAuthorization, AliyunModerationError, moderate, moderationPassed } from '../server/features/assistant/moderation'
import { boundedJson } from '../server/features/assistant/network'
import { callModel, modelBody, ModelResponseError } from '../server/features/assistant/provider'
import { assistantCredentialsSchema, defaultAssistantSettings } from '../shared/assistant/settings'

const settings = { ...defaultAssistantSettings, baseUrl: 'https://model.example.com/v1', model: 'fixture' }
const credentials = assistantCredentialsSchema.parse({ modelKey: 'test-key', aliyunKeyId: 'test-id', aliyunKeySecret: 'test-secret' })
const signal = new AbortController().signal
// Fixed vendor response: sensitiveData is not enabled and is absent from Detail.
const clear = { Code: 200, Data: { Suggestion: 'pass', Detail: [{ Type: 'contentModeration', Suggestion: 'pass' }, { Type: 'promptAttack', Suggestion: 'pass' }] } }

test('ACS3 签名与阿里云官方固定参数示例一致', async () => {
  const headers = await aliyunAuthorization({ host: 'ecs.cn-shanghai.aliyuncs.com', body: '', action: 'RunInstances', version: '2014-05-26', date: '2023-10-26T10:22:32Z', nonce: '3156853299f313e23d1673dc12e1703d', keyId: 'YourAccessKeyId', keySecret: 'YourAccessKeySecret', query: 'ImageId=win2019_1809_x64_dtc_zh-cn_40G_alibase_20230811.vhd&RegionId=cn-shanghai' })
  expect(headers.authorization).toBe('ACS3-HMAC-SHA256 Credential=YourAccessKeyId,SignedHeaders=host;x-acs-action;x-acs-content-sha256;x-acs-date;x-acs-signature-nonce;x-acs-version,Signature=06563a9e1b43f5dfe96b81484da74bceab24a1d853912eee15083a6f0f3283c0')
})
test('审核只有所有必需维度明确通过才放行；未知、缺字段、未开通维度均关闭', () => {
  expect(moderationPassed(clear)).toBe(true)
  for (const value of ['block', 'watch', 'mask']) {
    expect(moderationPassed({ ...clear, Data: { ...clear.Data, Suggestion: value } })).toBe(false)
    expect(moderationPassed({ ...clear, Data: { ...clear.Data, Detail: [...clear.Data.Detail, { Type: 'customLabel', Suggestion: value }] } })).toBe(false)
  }
  for (const value of [{ Code: 500 }, {}, { ...clear, Data: { ...clear.Data, Suggestion: 'unknown' } }, { ...clear, Data: { ...clear.Data, Detail: clear.Data.Detail.slice(0, 1) } }])
    expect(() => moderationPassed(value)).toThrow()
})
test.each(['contentModeration', 'promptAttack'])('缺少 %s 或该维度未通过时仍不放行', (type) => {
  expect(() => moderationPassed({ ...clear, Data: { ...clear.Data, Detail: clear.Data.Detail.filter(item => item.Type !== type) } })).toThrow(expect.objectContaining({ code: 'moderation_incomplete' }))
  for (const value of ['block', 'watch', 'mask'])
    expect(moderationPassed({ ...clear, Data: { ...clear.Data, Detail: clear.Data.Detail.map(item => item.Type === type ? { ...item, Suggestion: value } : item) } })).toBe(false)
})
test.each(['input', 'output'] as const)('%s 审核仅返回合规和提示词攻击检测时正常通过，不要求敏感内容检测', async (direction) => {
  const fetcher = vi.fn<Fetch>(async () => Response.json(clear))
  await expect(moderate('安全测试文本', direction, settings, credentials, signal, fetcher)).resolves.toBe(true)
  expect(fetcher).toHaveBeenCalledTimes(1)
})
test('审核整个文本、拒绝超长内容，不跟随重定向或自动重试', async () => {
  const fetcher = vi.fn<Fetch>(async () => Response.json(clear))
  expect(await moderate('问题和完整上下文', 'input', settings, credentials, signal, fetcher)).toBe(true)
  const [url, init] = fetcher.mock.calls[0]!
  expect(url).toBe('https://green-cip.cn-shanghai.aliyuncs.com/')
  expect(init).toMatchObject({ method: 'POST', redirect: 'error' })
  const form = new URLSearchParams(String(init?.body))
  expect(form.get('Service')).toBe('query_security_check_pro')
  expect(JSON.parse(form.get('ServiceParameters')!)).toEqual({ content: '问题和完整上下文' })
  await expect(moderate('😀'.repeat(1001), 'input', settings, credentials, signal, fetcher)).rejects.toMatchObject({ code: 'context_limit' })
  expect(fetcher).toHaveBeenCalledTimes(1)
  fetcher.mockRejectedValueOnce(new Error('upstream secret in error message'))
  await expect(moderate('test', 'output', settings, credentials, signal, fetcher)).rejects.toMatchObject({ message: '服务暂不可用，请稍后重试' })
  expect(fetcher).toHaveBeenCalledTimes(2)
})
test('模型只接受有界工具调用或最终 JSON，请求包含系统与工具定义', async () => {
  const body = modelBody(settings, [{ role: 'user', content: '问题' }])
  const intent = { text: '你好', articles: [], references: [], taxonomy: null }
  const fetcher = vi.fn<Fetch>(async () => Response.json({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(intent) } }], usage: { prompt_tokens: 100, completion_tokens: 10 } }))
  expect(await callModel(settings, credentials, body, signal, fetcher)).toMatchObject({ kind: 'final', intent, usage: { prompt_tokens: 100, completion_tokens: 10 } })
  expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ redirect: 'error', headers: { authorization: 'Bearer test-key' } })
  expect(body.messages[0]?.content).toContain(JSON.stringify(body.response_format.json_schema.schema))
  expect(() => modelBody(settings, [{ role: 'user', content: 'x'.repeat(2000) }])).toThrow()
})

test.each([
  { name: '缺少 text', intent: { articles: [], references: [], taxonomy: null }, detail: 'text：缺失或类型错误，应为字符串' },
  { name: '空数组错误地返回 null', intent: { text: '介绍', articles: null, references: [], taxonomy: null }, detail: 'articles：缺失或类型错误，应为数组' },
  { name: '文本长度超过上限', intent: { text: '文'.repeat(1201), articles: [], references: [], taxonomy: null }, detail: 'text：超过长度或数量上限' },
  { name: '未知字段名与值不进入错误', intent: { text: '介绍', articles: [], references: [], taxonomy: null, PRIVATE_SECRET: 'PRIVATE_SECRET' }, detail: '回答：包含未定义字段' },
  { name: '非法分类值不进入错误', intent: { text: '介绍', articles: [], references: [], taxonomy: 'PRIVATE_SECRET' }, detail: 'taxonomy：取值或格式不符合约定' },
])('模型 JSON 契约失败给管理员字段级诊断：$name', async ({ intent, detail }) => {
  const fetcher = vi.fn<Fetch>(async () => Response.json({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(intent) } }] }))
  const error: unknown = await callModel(settings, credentials, modelBody(settings, [{ role: 'user', content: '介绍博客' }]), signal, fetcher).catch(cause => cause)
  expect(error).toBeInstanceOf(ModelResponseError)
  expect(error).toMatchObject({ statusCode: 503, code: 'invalid_model_response', message: '模型返回格式不符合要求，请稍后重试', adminMessage: expect.stringContaining(detail) })
  expect(JSON.stringify(error)).not.toContain('PRIVATE_SECRET')
  expect(fetcher).toHaveBeenCalledTimes(1)
})

test('阿里云 403 NoPermission 提供固定授权诊断，不返回原始错误正文', async () => {
  const fetcher = vi.fn<Fetch>(async () => Response.json({ Code: 'NoPermission', Message: 'PRIVATE_SECRET', Recommend: 'https://example.com?token=PRIVATE_SECRET', RequestId: 'PRIVATE_SECRET' }, { status: 403 }))
  const error: unknown = await moderate('安全测试文本', 'output', settings, credentials, signal, fetcher).catch(cause => cause)
  expect(error).toBeInstanceOf(AliyunModerationError)
  expect(error).toMatchObject({ code: 'moderation_permission_denied', upstreamStatus: 403, adminStatusCode: 422, adminMessage: expect.stringContaining('AliyunYundunGreenWebFullAccess') })
  expect(JSON.stringify(error)).not.toContain('PRIVATE_SECRET')
  expect(fetcher).toHaveBeenCalledTimes(1)
})

test('阿里云未知或超长错误正文也受读取上限约束；HTTP 200 业务失败同样拒绝执行', async () => {
  for (const response of [Response.json({ Code: 'PRIVATE_SECRET', Message: 'PRIVATE_SECRET' }, { status: 500 }), new Response('PRIVATE_SECRET'.repeat(1000), { status: 500 })]) {
    const error: unknown = await moderate('test', 'input', settings, credentials, signal, async () => response).catch(cause => cause)
    expect(error).toMatchObject({ code: 'moderation_unavailable', adminStatusCode: 503 })
    expect(JSON.stringify(error)).not.toContain('PRIVATE_SECRET')
  }
  await expect(moderate('test', 'input', settings, credentials, signal, async () => Response.json({ Code: 500, Message: 'PRIVATE_SECRET' }))).rejects.toMatchObject({ code: 'moderation_unavailable' })
})
describe.each([
  { finish_reason: 'length', message: { role: 'assistant', content: '{}' } },
  { finish_reason: 'stop', message: { role: 'assistant', content: 'not json' } },
  { finish_reason: 'stop', message: { role: 'assistant', content: '<script>alert(1)</script>' } },
  { finish_reason: 'tool_calls', message: { role: 'assistant', tool_calls: [{ id: 'x', type: 'function', function: { name: 'read_secret', arguments: '{}' } }] } },
])('模型异常拒绝：$finish_reason', (choice) => {
  test('不修复重试，不传出未检查内容', async () => {
    const fetcher = vi.fn<Fetch>(async () => Response.json({ choices: [choice] }))
    await expect(callModel(settings, credentials, modelBody(settings, [{ role: 'user', content: 'hi' }]), signal, fetcher)).rejects.toMatchObject({ code: 'invalid_model_response' })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
test('供应商响应按实际字节读取上限，拒绝 HTTP 错误和重定向', async () => {
  await expect(boundedJson(new Response('x'.repeat(65_537)))).rejects.toMatchObject({ code: 'response_limit' })
  await expect(boundedJson(new Response('sensitive upstream details', { status: 500 }))).rejects.toMatchObject({ code: 'upstream_unavailable' })
  await expect(boundedJson(new Response(null, { status: 302, headers: { location: 'https://evil.example.com' } }))).rejects.toThrow()
})
