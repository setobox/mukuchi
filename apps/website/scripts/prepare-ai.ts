import type { AiQuery } from '../server/features/ai/repository.ts'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import { markdownFiles, readSnapshot, summarySnapshotPath } from '../content/ai/source.ts'
import { postsRoot } from '../content/validation.ts'
import { decryptApiKey } from '../server/features/ai/crypto.ts'
import { prepareSummaries } from '../server/features/ai/prepare.ts'
import { generateSummary } from '../server/features/ai/provider.ts'
import { createAiRepository } from '../server/features/ai/repository.ts'
import { digest } from '../shared/ai/model.ts'

// A trusted workflow prepares once; both subsequent builds consume this frozen snapshot.
if (process.env.MUKUCHI_AI_SNAPSHOT_FROZEN === 'true') {
  const snapshot = await readSnapshot()
  const files = await markdownFiles(postsRoot)
  const articles = await Promise.all(files.map(async path => ({ path, source: await readFile(join(postsRoot, path), 'utf8') })))
  articles.sort((a, b) => a.path.localeCompare(b.path))
  if (!snapshot || snapshot.manifestHash !== await digest(JSON.stringify(articles.map(article => [article.path, article.source]))))
    throw new Error('AI 摘要快照缺失或文章已变化，请重新准备')
  process.exit(0)
}
const remote = process.env.MUKUCHI_AI_REMOTE === 'true'
if (remote && process.env.GITHUB_ACTIONS === 'true' && (process.env.GITHUB_REF !== 'refs/heads/main' || process.env.GITHUB_EVENT_NAME === 'pull_request'))
  throw new Error('生产 AI 配置仅允许正式分支发布流程访问')
const files = await markdownFiles(postsRoot)
const articles = await Promise.all(files.map(async path => ({ path, source: await readFile(join(postsRoot, path), 'utf8') })))
let database: DatabaseSync | undefined
let query: AiQuery
if (remote) {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID
  const databaseId = process.env.MUKUCHI_ADMIN_DATABASE_ID
  const token = process.env.CLOUDFLARE_API_TOKEN
  query = async (sql, params = []) => {
    if (!account || !databaseId || !token)
      throw new Error('生产数据库访问未配置')
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${databaseId}/query`, { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(10_000), headers: { 'authorization': `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ sql, params }) })
    if (!response.ok)
      throw new Error('生产摘要存储暂不可用')
    const parsed = z.object({ success: z.literal(true), result: z.array(z.object({ success: z.literal(true), results: z.array(z.record(z.string(), z.unknown())) })).min(1) }).parse(await response.json())
    return parsed.result[0]!.results
  }
}
else {
  const path = process.env.NUXT_ADMIN_DATABASE_PATH || '.data/admin.sqlite'
  if (existsSync(path))
    database = new DatabaseSync(path)
  query = async (sql, params = []) => {
    if (!database)
      throw new Error('本地后台数据库未初始化')
    return database.prepare(sql).all(...params) as Record<string, unknown>[]
  }
}
try {
  const repo = createAiRepository(query)
  const stored = await repo.settings().catch(() => {
    console.warn('[AI 摘要] 配置暂不可用，本次构建使用原简介。')
    return null
  })
  let apiKey: string | undefined
  const snapshot = await prepareSummaries(articles, {
    settings: stored?.settings ?? null,
    cached: repo.cached,
    cache: repo.cache,
    async generate(input, signal) {
      if (process.env.CI && !remote)
        throw new Error('验证构建不调用 AI')
      apiKey ??= await decryptApiKey(stored!.encryptedKey, process.env.NUXT_AI_ENCRYPTION_KEY || '')
      return generateSummary(stored!.settings, apiKey, input, { signal })
    },
    warn: (path, reason) => console.warn(`[AI 摘要] ${path}：${reason || '未获得有效摘要'}，使用原简介。`),
  })
  await mkdir(dirname(summarySnapshotPath), { recursive: true })
  const temporary = `${summarySnapshotPath}.${process.pid}.tmp`
  await writeFile(temporary, JSON.stringify(snapshot), 'utf8')
  await rename(temporary, summarySnapshotPath)
  console.log(`AI 摘要准备完成：${Object.keys(snapshot.records).length}/${articles.length} 篇使用有效摘要。`)
}
finally { database?.close() }
