import type { SummaryRecord } from '../shared/ai/model'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { applySummarySnapshot } from '../content/ai/source'
import { createAdminRepository } from '../server/features/admin/repository'
import { summaryInput, writeSummary } from '../server/features/ai/content'
import { decryptApiKey, encryptApiKey } from '../server/features/ai/crypto'
import { prepareSummaries } from '../server/features/ai/prepare'
import { generateSummary } from '../server/features/ai/provider'
import { createAiRepository } from '../server/features/ai/repository'
import { aiSettingsSchema, defaultAiSettings, digest, normalizeSummaryInput, summaryConfigHash } from '../shared/ai/model'
import { readFrontmatter, validateFrontmatter } from '../shared/content/document'
import { createRssFeed } from '../shared/rss/feed'

afterEach(() => vi.restoreAllMocks())
const source = '---\ntitle: 测试文章\ndescription: 原简介\npublish: 2026-09-16\n---\n\n这是用于测试的文章正文。\n'
const settings = { ...defaultAiSettings, enabled: true, baseUrl: 'https://example.com/v1', model: 'test-model' }

test('摘要在内容缓存计算前合入，文本修改与关闭立即改变索引输入，RSS 复用相同文案', async () => {
  const input = await summaryInput(source)
  const configHash = await summaryConfigHash(settings)
  const snapshot = { version: 1 as const, manifestHash: await digest(source), configHash, records: { 'a.md': { text: '第一版摘要', inputHash: input.inputHash, configHash } } }
  const first = await applySummarySnapshot(source, 'a.md', snapshot)
  expect(readFrontmatter(first, 'a.md')).toMatchObject({ description: '第一版摘要', summarySource: 'ai' })
  snapshot.records['a.md'].text = '修改后的摘要'
  const second = await applySummarySnapshot(source, 'a.md', snapshot)
  expect(await digest(second)).not.toBe(await digest(first))
  const metadata = validateFrontmatter(second, 'a.md', 'posts')
  expect(metadata.description).toBe('修改后的摘要')
  const rss = createRssFeed([{ ...metadata, path: '/posts/a' }], { name: '测试', description: '网站简介', author: '站主', siteUrl: 'https://example.com', baseURL: '/' })
  expect(rss).toContain('<description>修改后的摘要</description>')
  for (const text of [await applySummarySnapshot(source, 'a.md', null), await applySummarySnapshot(source.replace('title:', 'aiSummary: false\ntitle:'), 'a.md', snapshot), await applySummarySnapshot(`${source}修改`, 'a.md', snapshot)]) {
    expect(readFrontmatter(text, 'a.md')).toMatchObject({ description: '原简介', summarySource: 'description' })
  }
})
function cache() {
  const data = new Map<string, SummaryRecord>()
  return { cached: vi.fn(async (input: string, config: string) => data.get(`${input}:${config}`) ?? null), cache: vi.fn(async (record: SummaryRecord) => {
    data.set(`${record.inputHash}:${record.configHash}`, record)
  }) }
}

test('文章默认开启摘要，关闭后保留必填原简介和现有元数据', () => {
  expect(validateFrontmatter(source, 'test.md', 'posts')).toMatchObject({ aiSummary: true, description: '原简介' })
  expect(validateFrontmatter(source.replace('description:', 'aiSummary: false\ndescription:'), 'test.md', 'posts').aiSummary).toBe(false)
  expect(() => validateFrontmatter(source.replace('原简介', ''), 'test.md', 'posts')).toThrow()
  expect(validateFrontmatter(source.replace('title:', 'summary: { text: 无效指纹 }\ntitle:'), 'test.md', 'posts')).toMatchObject({ description: '原简介', summary: undefined })
})

test('内容指纹忽略换行形式和非输入元数据，标题与正文变化使指纹失效', async () => {
  const base = await summaryInput(source)
  expect((await summaryInput(source.replace(/\n/g, '\r\n'))).inputHash).toBe(base.inputHash)
  expect((await summaryInput(source.replace('原简介', '更新说明'))).inputHash).toBe(base.inputHash)
  expect((await summaryInput(source.replace('测试文章', '新的标题'))).inputHash).not.toBe(base.inputHash)
  expect((await summaryInput(`${source}新增正文`)).inputHash).not.toBe(base.inputHash)
})

test('首次补齐后重建零调用，仅变化文章重新生成，关闭文章不调用', async () => {
  const store = cache()
  const generate = vi.fn(async () => '生成的摘要')
  const warn = vi.fn()
  const articles = [{ path: 'a.md', source }, { path: 'b.md', source: `${source}第二篇` }, { path: 'off.md', source: source.replace('title:', 'aiSummary: false\ntitle:') }]
  const options = { settings, ...store, generate, warn }
  const first = await prepareSummaries(articles, options)
  expect(generate).toHaveBeenCalledTimes(2)
  expect(Object.keys(first.records)).toEqual(['a.md', 'b.md'])
  expect(await prepareSummaries(articles, options)).toEqual(first)
  expect(generate).toHaveBeenCalledTimes(2)
  await prepareSummaries([{ path: 'a.md', source: `${source}修改` }, articles[1]!], options)
  expect(generate).toHaveBeenCalledTimes(3)
  expect(warn).not.toHaveBeenCalled()
})

test('手动摘要按相同指纹复用，未发布草稿结果不写共享缓存', async () => {
  const store = cache()
  const article = await summaryInput(source)
  const record = { text: '手动调整的摘要', inputHash: article.inputHash, configHash: await summaryConfigHash(settings) }
  const saved = writeSummary(source, record)
  const generate = vi.fn(async () => '新摘要')
  const options = { settings, ...store, generate, warn: vi.fn() }
  expect((await prepareSummaries([{ path: 'a.md', source: saved }], options)).records['a.md']).toEqual(record)
  expect(store.cache).not.toHaveBeenCalled()
  await prepareSummaries([{ path: 'a.md', source: `${saved}修改正文` }], options)
  expect(generate).toHaveBeenCalledTimes(1)
  await prepareSummaries([{ path: 'a.md', source: saved }], { ...options, settings: { ...settings, model: 'new-model' } })
  expect(generate).toHaveBeenCalledTimes(2)
})

test('生成失败或关闭服务时返回可构建的回退快照，不使用过期摘要', async () => {
  const options = { settings, ...cache(), generate: vi.fn(async () => {
    throw new Error('failure')
  }), warn: vi.fn() }
  expect((await prepareSummaries([{ path: 'a.md', source }], options)).records).toEqual({})
  expect(options.warn).toHaveBeenCalledWith('a.md')
  expect((await prepareSummaries([{ path: 'a.md', source }], { ...options, settings: null })).records).toEqual({})
})

test('生成阶段总预算终止挂起请求，重复正文合并调用', async () => {
  const generate = vi.fn((_input: string, signal: AbortSignal) => new Promise<string>((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true })))
  const warn = vi.fn()
  const snapshot = await prepareSummaries([{ path: 'a.md', source }, { path: 'b.md', source }], { settings, ...cache(), generate, warn, budgetMs: 10 })
  expect(snapshot.records).toEqual({})
  expect(generate).toHaveBeenCalledTimes(1)
  expect(warn).toHaveBeenCalledTimes(2)
})

test('API 密钥采用随机密文，错误密钥不能解密，错误不回显密钥', async () => {
  const secret = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
  const value = 'test-api-key-private'
  const first = await encryptApiKey(value, secret)
  expect(await encryptApiKey(value, secret)).not.toBe(first)
  expect(first).not.toContain(value)
  expect(await decryptApiKey(first, secret)).toBe(value)
  await expect(decryptApiKey(first, btoa('x'.repeat(32)))).rejects.toMatchObject({ statusCode: 503 })
  await expect(encryptApiKey(value, '')).rejects.toMatchObject({ statusCode: 503 })
})

test('单次超时最多重试一次，缓存故障也受总预算限制', async () => {
  const request = vi.fn<typeof fetch>((_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })))
  await expect(generateSummary(settings, 'private', '正文', { fetch: request, timeoutMs: 5 })).rejects.toMatchObject({ statusCode: 504 })
  expect(request).toHaveBeenCalledTimes(2)
  const generate = vi.fn(async () => '摘要')
  const snapshot = await prepareSummaries([{ path: 'a.md', source }], { settings, ...cache(), cached: () => new Promise(() => {}), generate, warn: vi.fn(), budgetMs: 5 })
  expect(snapshot.records).toEqual({})
  expect(generate).not.toHaveBeenCalled()
})

test('AI 请求保持兼容格式、拒绝重定向和无效响应，临时失败最多重试一次', async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('', { status: 429 })).mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: '有效摘要' }, finish_reason: 'stop' }] })))
  expect(await generateSummary(settings, 'private', '正文', { fetch: request })).toBe('有效摘要')
  expect(request).toHaveBeenCalledTimes(2)
  expect(request.mock.calls[0]![0]).toBe('https://example.com/v1/chat/completions')
  expect(request.mock.calls[0]![1]).toMatchObject({ redirect: 'manual' })
  const redirect = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 302, headers: { location: 'https://other.example' } }))
  await expect(generateSummary(settings, 'private', '正文', { fetch: redirect })).rejects.toMatchObject({ statusCode: 502 })
  expect(redirect).toHaveBeenCalledTimes(1)
  const empty = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: '' } }] })))
  await expect(generateSummary(settings, 'private', '正文', { fetch: empty })).rejects.toMatchObject({ statusCode: 502 })
  await expect(generateSummary(settings, 'private', '字'.repeat(32001), { fetch: empty })).rejects.toMatchObject({ statusCode: 422 })
})

test('设置仅接受 HTTPS 基址，版本冲突不覆盖设置，摘要缓存持久复用', async () => {
  expect(aiSettingsSchema.safeParse({ ...settings, baseUrl: 'https://user:secret@example.com' }).success).toBe(false)
  expect(aiSettingsSchema.safeParse({ ...settings, baseUrl: 'http://example.com' }).success).toBe(false)
  const db = new DatabaseSync(':memory:')
  try {
    db.exec(readFileSync(new URL('../migrations/admin/0002_ai.sql', import.meta.url), 'utf8'))
    const repo = createAiRepository(createAdminRepository({ close() {}, async batch(statements) {
      return statements.map(statement => db.prepare(statement.sql).all(...(statement.params ?? [])) as Record<string, unknown>[])
    } }).query)
    expect((await repo.settings()).settings.enabled).toBe(false)
    await repo.saveSettings(settings, 'ciphertext', 0)
    await expect(repo.saveSettings({ ...settings, enabled: false }, '', 0)).rejects.toMatchObject({ statusCode: 409 })
    expect((await repo.settings()).settings.enabled).toBe(true)
    const record = { text: '摘要', inputHash: await digest(normalizeSummaryInput('标题', '正文')), configHash: await summaryConfigHash(settings) }
    await repo.cache(record)
    expect(await repo.cached(record.inputHash, record.configHash)).toEqual(record)
  }
  finally { db.close() }
})
