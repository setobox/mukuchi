import type { PlatformOptions } from '../server/features/admin/database'
import { Buffer } from 'node:buffer'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { readBoundedStream } from '../server/features/admin/body'
import { openDatabase, openStorage, publishLocal, readContent, safeFile } from '../server/features/admin/drivers/node'
import { createAdminRepository } from '../server/features/admin/repository'
import { localRequestAllowed } from '../server/features/auth/policy'
import { editorSegments, imageReferences, validateArticle } from '../server/features/drafts/content'
import { identifyImage } from '../server/features/media/images'
import { executePublication } from '../server/features/publishing/engine'
import { createGithub } from '../server/features/publishing/github'
import { articleRoute, filePathSchema, sha256 } from '../shared/admin/model'
import { splitDocument } from '../shared/content/document'

const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach(cleanup => cleanup()))
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'mukuchi-admin-'))
  const options: PlatformOptions = { filename: join(directory, 'admin.sqlite'), postsDirectory: join(directory, 'posts'), imagesDirectory: join(directory, 'images'), assetsDirectory: join(directory, 'assets'), binding: null, bucket: null }
  mkdirSync(options.postsDirectory)
  mkdirSync(options.imagesDirectory)
  const setup = new DatabaseSync(options.filename)
  setup.exec(readFileSync(new URL('../migrations/admin/0001_admin.sql', import.meta.url), 'utf8'))
  setup.close()
  const db = openDatabase(options)
  cleanups.push(() => {
    db.close()
    if (!directory.startsWith(join(tmpdir(), 'mukuchi-admin-')))
      throw new Error('临时目录越界')
    rmSync(directory, { recursive: true })
  })
  return { options, repo: createAdminRepository(db), directory }
}
const source = '---\ntitle: 测试\ndescription: 说明\npublish: \'2026-09-16\'\n---\n\n正文\n'

test('Workers Web Stream 请求体按字节合并，超限立即取消读取', async () => {
  const cancelled = vi.fn()
  const stream = () => new ReadableStream<Uint8Array>({ start(controller) {
    controller.enqueue(new Uint8Array([1, 2]))
    controller.enqueue(new Uint8Array([3, 4]))
  }, cancel: cancelled })
  const complete = new ReadableStream<Uint8Array>({ start(controller) {
    controller.enqueue(new Uint8Array([1, 2]))
    controller.close()
  } })
  expect(await readBoundedStream(complete, 2)).toEqual(new Uint8Array([1, 2]))
  await expect(readBoundedStream(stream(), 3)).rejects.toMatchObject({ statusCode: 413 })
  expect(cancelled).toHaveBeenCalledTimes(1)
})

test('草稿保存允许未完成内容，旧版本不能覆盖新版本，重复创建返回原草稿', async () => {
  const { repo } = fixture()
  const draft = await repo.create('notes/a.md', '', null)
  expect(await repo.create('notes/a.md', '覆盖', null)).toEqual(draft)
  await repo.save(draft.id, draft.version, '未完成 YAML')
  await expect(repo.save(draft.id, draft.version, '旧内容')).rejects.toMatchObject({ statusCode: 409 })
  expect((await repo.draft(draft.id)).source).toBe('未完成 YAML')
  await expect(repo.remove(draft.id, 1)).rejects.toMatchObject({ statusCode: 409 })
  await repo.remove(draft.id, 2)
  await expect(repo.draft(draft.id)).rejects.toMatchObject({ statusCode: 404 })
})
test('生产、代理、局域网和伪造 Host 无法使用本地入口', () => {
  expect(localRequestAllowed(true, '::1', 'localhost:3000', false)).toBe(true)
  for (const args of [[false, '127.0.0.1', 'localhost:3000', false], [true, '192.168.1.2', 'localhost:3000', false], [true, '127.0.0.1', 'evil.test', false], [true, '127.0.0.1', 'localhost:3000', true], [true, undefined, 'localhost:3000', false]] as const) expect(localRequestAllowed(...args)).toBe(false)
})
test('拒绝路径穿越和 Windows 特殊路径，并遵循 Content 默认规范化', () => {
  for (const path of ['../a.md', '/a.md', 'a\\b.md', 'a/%2e%2e/a.md', 'a//b.md', 'CON.md', 'a/NUL.md', '.git/a.md', 'a.md:stream', 'a/../b.md']) expect(filePathSchema.safeParse(path).success).toBe(false)
  expect(filePathSchema.safeParse('1.notes/中文.md').success).toBe(true)
  expect(articleRoute('1.markdown/01.markdown.md')).toBe('/posts/markdown/markdown')
  expect(articleRoute('guide/index.md')).toBe('/posts/guide')
  expect(articleRoute('v/1.2.3.md')).toBe('/posts/v/1.2.3')
})
test('本地发布先写图片后写正文，幂等重试且拒绝外部修改与路径碰撞', async () => {
  const { options } = fixture()
  const bytes = new Uint8Array([1, 2, 3])
  const path = `/images/${await sha256(bytes)}.png`
  const input = { path: 'a.md', source, baseHash: null, remove: false, images: [{ path, bytes }] }
  const hash = await publishLocal(options, input)
  expect(await readContent(options, 'a.md')).toMatchObject({ source, hash })
  expect(readFileSync(join(options.imagesDirectory, path.slice(8)))).toEqual(Buffer.from(bytes))
  expect(await publishLocal(options, input)).toBe(hash)
  writeFileSync(join(options.postsDirectory, 'a.md'), '外部修改')
  await expect(publishLocal(options, { ...input, baseHash: hash, source: `${source}修改` })).rejects.toMatchObject({ statusCode: 409 })
  await expect(publishLocal(options, { ...input, path: '1.a.md' })).rejects.toMatchObject({ statusCode: 409 })
})
test('本地文件路径拒绝指向目录外的链接', async () => {
  const { options, directory } = fixture()
  const outside = join(directory, 'outside')
  mkdirSync(outside)
  await symlink(outside, join(options.postsDirectory, 'escape'), 'junction')
  await expect(safeFile(options.postsDirectory, 'escape/a.md')).rejects.toMatchObject({ statusCode: 400 })
})
test('私有图片按真实签名校验，内容寻址且可删除暂存', async () => {
  const { options } = fixture()
  const bytes = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXt8AAAAASUVORK5CYII=', 'base64'))
  expect(identifyImage(bytes)).toEqual({ extension: 'png', mime: 'image/png' })
  expect(() => identifyImage(new TextEncoder().encode('<svg/>'))).toThrow()
  expect(() => identifyImage(new Uint8Array(5 * 1024 * 1024 + 1))).toThrow()
  const storage = openStorage(options)
  const id = crypto.randomUUID()
  await storage.put(id, bytes, 'image/png')
  expect(await storage.get(id)).toEqual(bytes)
  await storage.remove(id)
  expect(await storage.get(id)).toBeNull()
})
test('MDC 嵌套、插槽、代码属性、行内组件与注释按源码保留', async () => {
  const body = '\n## 标题\n\n普通 **文字**\n\n::code-group\n```ts [demo.ts]{1}\nconst x = 1\n```\n#second\n:::card{title="嵌套"}\n内容\n:::\n::\n\n行内 :badge{label="值"} 内容\n\n<!-- 保留 -->\n'
  const parts = await editorSegments(source.split('正文')[0] + body)
  expect(parts.map(part => part.source).join('')).toBe(splitDocument(source.split('正文')[0] + body).body)
  expect(parts.filter(part => part.raw).map(part => part.source).join('')).toContain('::code-group')
  expect(parts.filter(part => part.raw).map(part => part.source).join('')).toContain(':badge')
  expect(parts.filter(part => part.raw).map(part => part.source).join('')).toContain('<!-- 保留 -->')
})
test('发布校验遵循 frontmatter，图片收集不会把代码示例当实际图片', async () => {
  await expect(validateArticle(source, 'a.md')).resolves.toMatchObject({ title: '测试' })
  await expect(validateArticle(source.replace('2026-09-16', '2026-02-30'), 'a.md')).rejects.toMatchObject({ statusCode: 422 })
  await expect(validateArticle(source.replace('title: 测试', 'title: 测试\npath: /changed'), 'a.md')).rejects.toMatchObject({ statusCode: 422 })
  const paths = await imageReferences(`${source}\n![a](/images/a.png)\n\n![b][ref]\n\n[ref]: /images/b.png\n\n\`\`\`md\n![x](/images/no.png)\n\`\`\``)
  expect([...paths]).toEqual(['/images/a.png', '/images/b.png'])
  expect(await imageReferences(`${source}\n<img src="/images/html.png">\n\n<!-- <img src="/images/comment.png"> -->`)).toEqual(new Set(['/images/html.png']))
})
test('GitHub 请求使用 Workers 支持的重定向策略且不向重定向地址转发凭据', async () => {
  const request = vi.fn<typeof fetch>(async (_url, options) => {
    if (options?.redirect === 'error')
      throw new TypeError('Workers does not support redirect: error')
    return Response.redirect('https://other.example/collect', 302)
  })
  const github = createGithub({ repository: 'test/blog', branch: 'main', token: 'test-secret' }, request)
  await expect(github.list()).rejects.toMatchObject({ statusCode: 503, message: 'GitHub 请求失败，请稍后重试' })
  expect(request).toHaveBeenCalledTimes(1)
  expect(request).toHaveBeenCalledWith('https://api.github.com/repos/test/blog/git/ref/heads/main', expect.objectContaining({ redirect: 'manual' }))
})

test('GitHub 将正文图片合为单个树与提交，更新引用禁止强推', async () => {
  const sha = (char: string) => char.repeat(40)
  const calls: { url: string, body: Record<string, unknown> | undefined }[] = []
  const request = vi.fn<typeof fetch>(async (url, options) => {
    const path = String(url).replace('https://api.github.com/repos/test/blog', '')
    const body = typeof options?.body === 'string' ? JSON.parse(options.body) as Record<string, unknown> : undefined
    calls.push({ url: path, body })
    if (path.startsWith('/git/ref/'))
      return Response.json({ object: { sha: sha('a') } })
    if (path === `/git/commits/${sha('a')}`)
      return Response.json({ tree: { sha: sha('b') } })
    if (path.startsWith('/git/trees/') && !body)
      return Response.json({ sha: sha('b'), truncated: false, tree: [] })
    return Response.json({ sha: sha(path === '/git/commits' ? 'e' : path === '/git/trees' ? 'd' : 'c') })
  })
  const github = createGithub({ repository: 'test/blog', branch: 'main', token: 'test-secret' }, request)
  const result = await github.prepare({ path: 'a.md', source, baseHash: null, remove: false, operationId: crypto.randomUUID(), images: [{ path: `/images/${'f'.repeat(64)}.png`, bytes: new Uint8Array([1]) }] })
  await github.commit(result.commit)
  const tree = calls.find(call => call.url === '/git/trees')?.body?.tree as { path: string }[]
  expect(tree.map(item => item.path)).toEqual([`apps/website/public/images/${'f'.repeat(64)}.png`, 'content/posts/a.md'])
  expect(calls.at(-1)?.body).toEqual({ sha: sha('e'), force: false })
  expect(JSON.stringify(result)).not.toContain('test-secret')
})

test('提交成功后响应丢失，重试核实已保存的 SHA，并保留发布期间的新草稿', async () => {
  const { repo, options } = fixture()
  const draft = await repo.create('retry.md', source, null)
  let committed = false
  const prepare = vi.fn(async () => ({ commit: 'e'.repeat(40), hash: 'c'.repeat(40) }))
  const commit = vi.fn(async () => {
    committed = true
    await repo.save(draft.id, 1, '正在编辑，元数据尚未完成')
    throw new Error('连接中断')
  })
  const context = {
    local: false,
    withRepo: async <T>(action: (repository: typeof repo) => Promise<T>) => action(repo),
    storage: openStorage(options),
    github: { ...createGithub({ repository: 'test/blog', branch: 'main', token: '' }), prepare, commit, includes: vi.fn(async () => committed) },
    publishLocal: (input: Parameters<typeof publishLocal>[1]) => publishLocal(options, input),
    cleanup: vi.fn(async () => {}),
  }
  const input = { draftId: draft.id, version: 1, operationId: crypto.randomUUID(), action: 'publish' as const }
  await expect(executePublication(context, input)).rejects.toThrow('连接中断')
  expect(await repo.publication(input.operationId)).toMatchObject({ status: 'preparing', commit: 'e'.repeat(40) })
  await expect(executePublication(context, input)).resolves.toMatchObject({ status: 'submitted', commit: 'e'.repeat(40) })
  await expect(executePublication(context, { ...input, operationId: crypto.randomUUID() })).resolves.toMatchObject({ id: input.operationId })
  expect(prepare).toHaveBeenCalledTimes(1)
  expect(commit).toHaveBeenCalledTimes(1)
  expect(await repo.draft(draft.id)).toMatchObject({ source: '正在编辑，元数据尚未完成', version: 2, publishedVersion: 1, baseHash: 'c'.repeat(40) })
  expect(context.cleanup).not.toHaveBeenCalled()
})

test('本地发布绑定版本，撤下保留编辑稿，重复操作不会重复写入', async () => {
  const { repo, options } = fixture()
  const draft = await repo.create('publish.md', source, null)
  const write = vi.fn((input: Parameters<typeof publishLocal>[1]) => publishLocal(options, input))
  const context = {
    local: true,
    withRepo: async <T>(action: (repository: typeof repo) => Promise<T>) => action(repo),
    storage: openStorage(options),
    github: createGithub({ repository: 'test/blog', branch: 'main', token: '' }),
    publishLocal: write,
    cleanup: vi.fn(async () => {}),
  }
  const input = { draftId: draft.id, version: 1, operationId: crypto.randomUUID(), action: 'publish' as const }
  await expect(executePublication(context, { ...input, version: 2 })).rejects.toMatchObject({ statusCode: 409 })
  await expect(executePublication(context, input)).resolves.toMatchObject({ status: 'local' })
  await executePublication(context, input)
  expect(write).toHaveBeenCalledTimes(1)
  await executePublication(context, { ...input, operationId: crypto.randomUUID(), action: 'unpublish' })
  expect(await readContent(options, draft.path)).toBeNull()
  expect(await repo.draft(draft.id)).toMatchObject({ source, baseHash: null })
  const withdrawn = await repo.draft(draft.id)
  await executePublication(context, { ...input, version: withdrawn.version, operationId: crypto.randomUUID() })
  expect(await readContent(options, draft.path)).toMatchObject({ source })
  expect(write).toHaveBeenCalledTimes(3)
})
