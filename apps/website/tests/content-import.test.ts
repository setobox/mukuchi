import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { expect, test } from 'vite-plus/test'

const exec = promisify(execFile)
const valid = '---\ntitle: 修复标题\ndescription: 修复简介\npublish: "2024-02-29"\n---\n# 正文\n'

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'newblog-content-import-'))
  const root = join(directory, 'content')
  const filename = join(directory, 'content.sqlite')
  await mkdir(join(root, 'posts', '2026'), { recursive: true })
  const article = join(root, 'posts', '2026', 'wsl3.md')
  await writeFile(article, '')
  await writeFile(join(root, 'posts', 'valid.md'), valid)
  for (const kind of ['about', 'use'])
    await writeFile(join(root, `${kind}.md`), valid)

  return {
    article,
    async run(dev: boolean, fallbackDate = '2026-10-01', prepare = false, hotSources: string[] = []) {
      const options = {
        cwd: fileURLToPath(new URL('./fixtures/content-import', import.meta.url)),
        dev,
        ready: false,
        overrides: {
          test: true,
          _prepare: prepare,
          buildDir: join(directory, '.nuxt'),
          contentImport: { root, fallbackDate },
          content: { _localDatabase: { type: 'sqlite', filename } },
        },
      }
      const result = await exec(process.execPath, ['--input-type=module', '--eval', `
        import { loadNuxt } from 'nuxt/kit'
        import { parseMarkdown } from '@nuxtjs/mdc/runtime'
        const { options, hotSources, article } = JSON.parse(process.argv[1])
        let collection
        let parsed = 0
        options.overrides.hooks = {
          'content:file:afterParse': (ctx) => {
            parsed++
            if (ctx.collection.name === 'posts') collection = ctx.collection
          },
        }
        const nuxt = await loadNuxt(options)
        try {
          await nuxt.ready()
          const template = nuxt.options.build.templates.find(item => item.filename === 'audio-manifest.ts')
          const audio = JSON.parse((await template.getContents()).replace(/^export default /, '').trim())
          const hot = []
          for (const hotSource of hotSources) {
            const file = { body: hotSource, path: article, id: 'posts/posts/2026/wsl3.md' }
            await nuxt.callHook('content:file:beforeParse', { file, collection, parserOptions: {} })
            const result = await parseMarkdown(file.body, { highlight: false })
            const content = { ...result.data, body: result.body }
            await nuxt.callHook('content:file:afterParse', { file, collection, content })
            hot.push(content)
          }
          console.log('IMPORT_RESULT:' + JSON.stringify({ parsed, audio, hot }))
        }
        finally { await nuxt.close() }
      `, JSON.stringify({ options, hotSources, article })], {
        cwd: fileURLToPath(new URL('..', import.meta.url)),
        timeout: 30_000,
        windowsHide: true,
      })
      const line = result.stdout.split('\n').find(line => line.startsWith('IMPORT_RESULT:'))!
      const data = JSON.parse(line.slice('IMPORT_RESULT:'.length)) as {
        parsed: number
        audio: { articles: { path: string, title: string }[] }
        hot: { title: string, publish: string, wordCount: number, body: unknown }[]
      }
      return { ...data, output: result.stdout + result.stderr }
    },
    posts() {
      const db = new DatabaseSync(filename, { readOnly: true })
      try {
        return db.prepare('SELECT path, title, description, publish, wordCount FROM _content_posts ORDER BY path').all()
      }
      finally { db.close() }
    },
    async close() { await rm(directory, { recursive: true, force: true }) },
  }
}

test('空文章开发启动、音频和缓存正常；跨日日期更新，生产检查仍读取原文件', async () => {
  const app = await fixture()
  try {
    const first = await app.run(true)
    expect(first.output).toMatch(/wsl3.md.*缺少 YAML frontmatter/)
    expect(app.posts()).toContainEqual({ path: '/posts/2026/wsl3', title: 'wsl3', description: '', publish: '2026-10-01', wordCount: 0 })
    expect(app.posts()).toContainEqual(expect.objectContaining({ path: '/posts/valid', title: '修复标题', publish: '2024-02-29' }))
    expect(first.audio.articles).toContainEqual(expect.objectContaining({ path: '/posts/2026/wsl3', title: 'wsl3' }))
    const cached = await app.run(true)
    expect(cached.parsed).toBe(0)
    expect(cached.output).toMatch(/wsl3.md.*缺少 YAML frontmatter/)
    await app.run(true, '2026-10-02')
    expect(app.posts()).toContainEqual(expect.objectContaining({ title: 'wsl3', publish: '2026-10-02' }))
    await expect(app.run(false)).rejects.toThrow(/wsl3.md.*缺少 YAML frontmatter/)
    expect(await readFile(app.article, 'utf8')).toBe('')
  }
  finally { await app.close() }
}, 120_000)

test('热更新先容错错误 YAML，修复后恢复真实元数据', async () => {
  const app = await fixture()
  try {
    const result = await app.run(true, '2026-10-01', false, ['---\ntitle: [broken\n---\n# 新标题\n正文', valid])
    expect(result.hot).toMatchObject([
      { title: '新标题', publish: '2026-10-01' },
      { title: '修复标题', publish: '2024-02-29' },
    ])
    expect(result.hot[0]!.wordCount).toBeGreaterThan(0)
    expect(JSON.stringify(result.hot[0]!.body)).toContain('正文')
  }
  finally { await app.close() }
}, 45_000)

test('工具准备阶段允许空文章，不阻断安装和类型检查', async () => {
  const app = await fixture()
  try {
    await expect(app.run(false, '2026-10-01', true)).resolves.toMatchObject({ audio: { articles: expect.arrayContaining([expect.objectContaining({ title: 'wsl3' })]) } })
  }
  finally { await app.close() }
}, 60_000)
