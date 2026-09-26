import type { AudioSteps } from '../server/features/audio/engine'
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { encryptApiKey } from '../server/features/ai/crypto'
import { audioArticle } from '../server/features/audio/content'
import { runAudioJob } from '../server/features/audio/engine'
import { audioDownloadUrl, AudioProviderError, createNarrationProvider } from '../server/features/audio/provider'
import { canResumeAudio } from '../server/features/audio/repository'
import { audioRange, audioResponse, saveAudio } from '../server/features/audio/storage'
import { audioConfigHash } from '../shared/audio/model'
import { audioBucket, audioDatabase, audioSettings, audioSource, mp3 } from './fixtures/audio'

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup())
  vi.restoreAllMocks()
})
function fixture() {
  const { db, repo } = audioDatabase()
  cleanups.push(db.close)
  return repo
}
const manifest = async (source = audioSource) => ({ revision: 'revision-1', articles: [await audioArticle('a.md', source)] })
const secret = btoa('a'.repeat(32))
const url = 'https://audio.bytespeech.com/test.mp3'
const step: AudioSteps = { do: async (_name, _options, callback) => callback(), sleep: async () => {} }

test('音频保留标题、链接文字与表格，两种类型共用适合朗读的全文且不使用摘要', async () => {
  const source = `${audioSource}\n## 标题\n\n[链接文字](https://example.com) 和 \`inline()\`\n\n\`\`\`ts\nconst useful = 42\n\`\`\`\n\n| 属性 | 值 |\n| --- | --- |\n| 名称 | 示例 |\n\n::note\n组件内的正文\n::\n`
  const article = await audioArticle('1.a.md', source)
  expect(article.path).toBe('/posts/a')
  expect(article.narration).toContain('链接文字 和 这段代码')
  expect(article.narration).toContain('这里作者提供了一段代码示例')
  expect(article.narration).not.toContain('const useful')
  expect(article.podcast).toBe(article.narration)
  expect(article.narration).toContain('名称；示例；')
  expect(article.narration).toContain('组件内的正文')
  expect(article.narration).not.toContain('原简介')
  expect((await audioArticle('a.md', source.replace('原简介', '新简介').replace('title:', 'tags: [新标签]\ncolor: red\ntitle:'))).inputHash).toBe(article.inputHash)
  expect((await audioArticle('a.md', source.replace(/\n/g, '\r\n'))).inputHash).toBe(article.inputHash)
  expect((await audioArticle('a.md', `${source}新增正文`)).inputHash).not.toBe(article.inputHash)
  expect(await audioConfigHash(audioSettings, 'narration')).toBe(await audioConfigHash({ ...audioSettings, dailyPodcasts: 2 }, 'narration'))
})

test('建立基线不补齐历史；重复部署和重复提交去重，正文更新建立新任务', async () => {
  const repo = fixture()
  const base = await manifest()
  await repo.saveSettings(audioSettings, '', 0)
  await repo.synchronize(base, true)
  await repo.synchronize(base)
  expect(await repo.jobs()).toHaveLength(0)
  const changed = await manifest(`${audioSource}更新`)
  await repo.synchronize(changed)
  await repo.synchronize(changed)
  await repo.enqueue(changed.articles[0]!, 'narration', audioSettings)
  expect(await repo.jobs()).toHaveLength(2)
  expect(await repo.claim()).toMatchObject({ status: 'running' })
  const running = await repo.claim()
  expect(await repo.claim()).toEqual(running)
  const usage = await repo.usage()
  expect(usage.podcasts + Number(usage.narrationCharacters > 0)).toBe(1)
})

test('额度用尽保留排队，次日恢复；关闭音频和旧配置不会预占额度', async () => {
  const repo = fixture()
  const base = await manifest()
  await repo.saveSettings({ ...audioSettings, dailyNarrationCharacters: 1, dailyPodcasts: 0 }, '', 0)
  await repo.synchronize(base, true)
  await repo.enqueue(base.articles[0]!, 'narration', audioSettings)
  expect(await repo.claim()).toBeNull()
  await repo.saveSettings(audioSettings, '', 1)
  const day = Date.parse('2026-09-18T15:59:00Z')
  const job = (await repo.claim(day))!
  expect(job.status).toBe('running')
  expect((await repo.usage(day)).narrationCharacters).toBe(Array.from(job.input).length)
  expect((await repo.usage(day + 120_000)).narrationCharacters).toBe(0)
  await repo.fail(job, 'failed', '测试失败')
  await repo.retry(job.id, (await repo.job(job.id)).version, false)
  await repo.saveSettings({ ...audioSettings, narrationSpeaker: 'new-voice' }, '', 2)
  expect(await repo.claim()).toBeNull()
  expect((await repo.job(job.id)).status).toBe('queued')
})

test('两个同时到达的调度只占一个执行槽和一次额度', async () => {
  const repo = fixture()
  const base = await manifest()
  await repo.saveSettings(audioSettings, '', 0)
  await repo.synchronize(base, true)
  await repo.enqueue(base.articles[0]!, 'podcast', audioSettings)
  await Promise.all([repo.claim(), repo.claim()])
  expect((await repo.jobs()).filter(job => job.status === 'running')).toHaveLength(1)
  expect((await repo.usage()).podcasts).toBe(1)
})

test('文章回退到旧正文时，可以重新排队从未提交上游的已取消任务', async () => {
  const repo = fixture()
  const base = await manifest()
  await repo.saveSettings(audioSettings, '', 0)
  await repo.synchronize(base, true)
  const old = (await repo.enqueue(base.articles[0]!, 'podcast', audioSettings))!
  await repo.synchronize(await manifest(`${audioSource}修改`))
  expect((await repo.job(old.id)).status).toBe('cancelled')
  await repo.synchronize(base)
  expect(await repo.job(old.id)).toMatchObject({ status: 'queued', attempt: 1 })
  await repo.synchronize(base)
  expect((await repo.job(old.id)).attempt).toBe(1)
})

test('旧任务乱序完成不能替代当前版本，旧审核和并发操作被拒绝，删除文章取消排队', async () => {
  const repo = fixture()
  const base = await manifest()
  await repo.saveSettings(audioSettings, '', 0)
  await repo.synchronize(base, true)
  const queued = (await repo.enqueue(base.articles[0]!, 'narration', audioSettings))!
  const old = (await repo.claim())!
  const changed = await manifest(`${audioSource}修改`)
  await repo.synchronize(changed)
  await repo.finish(old, 'old.mp3', 12)
  const stored = await repo.job(queued.id)
  expect(stored.publication).toBe('review')
  await expect(repo.publish(stored.id, stored.version, true, changed.articles[0])).rejects.toMatchObject({ statusCode: 409 })
  await expect(repo.publish(stored.id, stored.version, true, base.articles[0])).rejects.toMatchObject({ statusCode: 409 })
  await repo.synchronize({ revision: 'deleted', articles: [] })
  expect((await repo.jobs()).filter(job => job.status === 'queued')).toHaveLength(0)
  await expect(repo.saveSettings(audioSettings, '', 0)).rejects.toMatchObject({ statusCode: 409 })
})

test('超长正文明确失败，不调用供应商也不截断', async () => {
  const repo = fixture()
  const article = (await manifest(`${audioSource}${'字'.repeat(100_001)}`)).articles[0]!
  const job = (await repo.enqueue(article, 'narration', audioSettings))!
  expect(job.status).toBe('failed')
  expect(job.input.length).toBeGreaterThan(100_000)
  expect(job.message).toContain('未提交供应商')
})

async function jobFixture(kind: 'narration' | 'podcast' = 'narration', source = audioSource) {
  const repo = fixture()
  const current = await manifest(source)
  await repo.saveSettings(audioSettings, await encryptApiKey('secret-value', secret), 0)
  await repo.synchronize(current, true)
  const job = (await repo.enqueue(current.articles[0]!, kind, audioSettings))!
  await repo.claim()
  const storage = audioBucket()
  return { repo, current, job, ...storage, options: { repo, bucket: storage.bucket, step, id: job.id, attempt: 0, secret, manifest: current } }
}

test.each(['narration', 'podcast'] as const)('%s 任务存储并提交过滤后的文本，额度使用实际输入长度', async (kind) => {
  const source = `${audioSource}\n执行 \`pnpm run build\`，修改 src/main.ts，参考 https://example.com。\n\n::youtube{id="video-id"}\n点击播放\n::\n`
  const { repo, job, options } = await jobFixture(kind, source)
  expect(job.input).toContain('执行 这段代码，修改 这个文件，参考 这个链接。')
  expect(job.input).toContain('这里作者附上了一段视频。')
  expect(job.input).not.toMatch(/pnpm|src\/main|example\.com|video-id|点击播放/)
  const submit = vi.fn(async () => {})
  const podcast = vi.fn(async (input: Parameters<NonNullable<Parameters<typeof runAudioJob>[0]['podcast']>>[0]) => {
    await input.generated(url)
    return url
  })
  await runAudioJob({ ...options, narration: () => ({ submit, query: async () => url }), podcast, request: vi.fn(async () => mp3()) })
  if (kind === 'narration') {
    expect(submit).toHaveBeenCalledWith(job.input, expect.any(String))
    expect((await repo.usage()).narrationCharacters).toBe(Array.from(job.input).length)
  }
  else {
    expect(podcast).toHaveBeenCalledWith(expect.objectContaining({ text: job.input }))
    expect((await repo.usage()).podcasts).toBe(1)
  }
})

test('提交超时只查询原任务，成功朗读入 R2 后自动公开；重放不再次提交', async () => {
  const { repo, job, options, objects } = await jobFixture()
  const submit = vi.fn(async () => {
    throw new AudioProviderError('连接中断', true, true)
  })
  const query = vi.fn(async () => url)
  const narration = () => ({ submit, query })
  await runAudioJob({ ...options, narration, request: vi.fn(async () => mp3()) })
  expect(submit).toHaveBeenCalledTimes(1)
  expect(query).toHaveBeenCalledTimes(2)
  const finished = await repo.job(job.id)
  expect(finished).toMatchObject({ status: 'succeeded', publication: 'public', resultUrl: '', size: 6 })
  expect(objects.has(finished.objectKey)).toBe(true)
  await runAudioJob({ ...options, narration })
  expect(submit).toHaveBeenCalledTimes(1)
})

test('结果查询失败保存需要处理状态；恢复仅查询，不再次占用生成额度或提交', async () => {
  const { repo, job, options } = await jobFixture()
  const submit = vi.fn(async () => {})
  const query = vi.fn(async (): Promise<string | null> => {
    throw new AudioProviderError('查询中断', true, true)
  })
  await runAudioJob({ ...options, narration: () => ({ submit, query }) })
  const failed = await repo.job(job.id)
  expect(failed.status).toBe('unknown')
  expect(canResumeAudio(failed)).toBe(true)
  await expect(repo.retry(job.id, failed.version, false)).rejects.toMatchObject({ statusCode: 409 })
  const usage = await repo.usage()
  await repo.resume(job.id, failed.version)
  await repo.claim()
  query.mockResolvedValue(url)
  await runAudioJob({ ...options, attempt: 1, narration: () => ({ submit, query }), request: vi.fn(async () => mp3()) })
  expect(submit).toHaveBeenCalledTimes(1)
  expect(await repo.usage()).toEqual(usage)
  expect((await repo.job(job.id)).publication).toBe('public')
})

test('旧执行在新尝试启动后返回失败，不能覆盖新尝试的状态', async () => {
  const { repo, job, options } = await jobFixture()
  const submit = vi.fn(async () => {})
  const query = vi.fn(async (): Promise<string | null> => {
    const old = await repo.job(job.id)
    await repo.fail(old, 'unknown', '模拟执行中断')
    await repo.resume(old.id, (await repo.job(old.id)).version)
    await repo.claim()
    throw new AudioProviderError('旧请求终于返回超时', true)
  })
  await runAudioJob({ ...options, narration: () => ({ submit, query }) })
  expect(await repo.job(job.id)).toMatchObject({ attempt: 1, status: 'running', message: '' })
})

test('播客使用全文、确认的恢复点；成品只进审核，旧执行不能修改新重试', async () => {
  const { repo, job, options, current } = await jobFixture('podcast')
  // Typed provider mock preserves the real recovery callback contract.
  const calls: { resume: boolean, lastRound: number, text: string }[] = []
  await runAudioJob({ ...options, podcast: async (input) => {
    calls.push(input)
    if (!input.resume) {
      await input.progress(1)
      throw new AudioProviderError('断线', true, true)
    }
    await input.generated(url)
    return url
  }, request: vi.fn(async () => mp3()) })
  expect(calls.map(call => [call.resume, call.lastRound])).toEqual([[false, -1], [true, 1]])
  expect(calls[0]!.text).toBe(current.articles[0]!.podcast)
  const finished = await repo.job(job.id)
  expect(finished).toMatchObject({ status: 'succeeded', publication: 'review' })
  await repo.publish(job.id, finished.version, true, current.articles[0])
  await expect(repo.publish(job.id, finished.version, false, current.articles[0])).rejects.toMatchObject({ statusCode: 409 })
  await repo.fail({ ...finished, attempt: -1 }, 'failed', '旧执行失败')
  expect((await repo.job(job.id)).publication).toBe('public')
})

test('播客转存失败保留最终地址；恢复仅下载原成品，不重发付费生成', async () => {
  const { repo, job, options } = await jobFixture('podcast')
  const podcast = vi.fn(async (input: Parameters<NonNullable<Parameters<typeof runAudioJob>[0]['podcast']>>[0]) => {
    await input.generated(url)
    return url
  })
  await runAudioJob({ ...options, podcast, request: vi.fn(async () => new Response(null, { status: 503 })) })
  const failed = await repo.job(job.id)
  expect(failed).toMatchObject({ phase: 'generated', status: 'unknown', resultUrl: url })
  await repo.resume(job.id, failed.version)
  await repo.claim()
  await runAudioJob({ ...options, attempt: 1, podcast, request: vi.fn(async () => mp3()) })
  expect(podcast).toHaveBeenCalledOnce()
  expect(await repo.job(job.id)).toMatchObject({ status: 'succeeded', publication: 'review' })
})

test('长文本协议隔离密钥、校验任务 ID、将查询超时与鉴权失败留待检查', async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ code: 20000000, data: { task_id: 'id', task_status: 1 } }))
  const provider = createNarrationProvider(audioSettings, 'secret', request)
  await provider.submit('全文', 'id')
  const [, options] = request.mock.calls[0]!
  expect(options?.headers).toMatchObject({ 'X-Api-Key': 'secret', 'X-Api-Resource-Id': 'seed-tts-2.0' })
  expect(JSON.parse(String(options?.body))).toMatchObject({ unique_id: 'id', req_params: { text: '全文' } })
  request.mockResolvedValue(new Response(null, { status: 401 }))
  await expect(provider.query('id')).rejects.toMatchObject({ uncertain: true })
  await expect(provider.submit('全文', 'id')).rejects.toMatchObject({ uncertain: false })
  request.mockRejectedValue(new Error('secret should not leak'))
  await expect(provider.query('id')).rejects.toMatchObject({ uncertain: true, message: '火山连接中断或超时；请查询原任务确认结果' })
  for (const value of ['http://audio.bytespeech.com/a', 'https://bytespeech.com.attacker.test/a', 'https://user:pass@bytespeech.com/a', 'https://127.0.0.1/a']) expect(() => audioDownloadUrl(value)).toThrow()
})

test('R2 分块上传、失败中止和 Range / HEAD / 缓存验证', async () => {
  const { bucket, objects, abort, get } = audioBucket()
  expect(await saveAudio(bucket, 'audio', mp3())).toBe(6)
  await expect(saveAudio(bucket, 'bad', new Response('<html>error</html>'))).rejects.toThrow('不是 MP3')
  expect(abort).toHaveBeenCalledOnce()
  expect(objects.has('bad')).toBe(false)
  expect(audioRange('bytes=-2', 6)).toEqual({ offset: 4, length: 2 })
  expect(audioRange('bytes=0-99', 6)).toEqual({ offset: 0, length: 6 })
  for (const range of ['bytes=-0', 'bytes=6-', 'bytes=3-2', 'bytes=0-1,3-4']) expect(audioRange(range, 6)).toBe(false)
  const response = await audioResponse(bucket, 'audio', new Request('https://blog.test/audio', { headers: { range: 'bytes=1-3' } }))
  expect(response.status).toBe(206)
  expect(response.headers.get('content-range')).toBe('bytes 1-3/6')
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([0x44, 0x33, 1]))
  const previous = get.mock.calls.length
  expect((await audioResponse(bucket, 'audio', new Request('https://blog.test/audio', { method: 'HEAD' }))).headers.get('content-length')).toBe('6')
  expect(get).toHaveBeenCalledTimes(previous)
  expect((await audioResponse(bucket, 'audio', new Request('https://blog.test/audio', { headers: { 'if-none-match': '"audio-etag"' } }))).status).toBe(304)
  expect((await audioResponse(bucket, 'audio', new Request('https://blog.test/audio'), true)).headers.get('cache-control')).toContain('no-store')
})
