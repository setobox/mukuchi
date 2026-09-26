import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { expect, test } from 'vite-plus/test'
import { sortPosts } from '../shared/content/catalog.ts'
import { postSchema } from '../shared/content/schema.ts'

const exec = promisify(execFile)

async function setup(dev: boolean, collisionId?: string) {
  const directory = await mkdtemp(join(tmpdir(), 'newblog-content-routing-'))
  const filename = join(directory, 'content.sqlite')
  const options = {
    cwd: fileURLToPath(new URL('./fixtures/content-routing', import.meta.url)),
    dev,
    ready: false,
    overrides: {
      test: true,
      buildDir: join(directory, '.nuxt'),
      content: { _localDatabase: { type: 'sqlite', filename } },
    },
  }
  return {
    filename,
    // Content keeps its SQLite connection open after Nuxt closes. A separate
    // process releases it before fixture cleanup on Windows.
    build: () => exec(process.execPath, ['--input-type=module', '--eval', `
      import { loadNuxt } from 'nuxt/kit'
      const { options, collisionId } = JSON.parse(process.argv[1])
      options.overrides.hooks = {
        'content:file:beforeParse': ({ file }) => {
          if (collisionId && file.id.endsWith('2.installation.md'))
            file.id = collisionId
        },
      }
      const nuxt = await loadNuxt(options)
      try {
        await nuxt.ready()
      }
      finally {
        await nuxt.close()
      }
    `, JSON.stringify({ options, collisionId })], {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      timeout: 20_000,
      windowsHide: true,
    }),
    async close() {
      await rm(directory, { recursive: true, force: true })
    },
  }
}

test.each([true, false])('Content 默认路径在 dev=%s 时生效，元数据校验仍保留', async (dev) => {
  const fixture = await setup(dev)
  try {
    await fixture.build()
    // Reuse the same database to cover cached content as well as a fresh parse.
    await fixture.build()
    const db = new DatabaseSync(fixture.filename, { readOnly: true })
    try {
      expect(db.prepare('SELECT path FROM _content_posts ORDER BY path').all().map(row => row.path)).toEqual([
        '/posts',
        '/posts/guide/installation',
        '/posts/markdown/_getting-started',
        '/posts/markdown/markdown',
        '/posts/notes',
      ])
      const posts = db.prepare('SELECT path, stem, title, description, publish, pin FROM _content_posts').all().map(row => ({
        ...postSchema.parse(row),
        path: String(row.path),
        stem: String(row.stem),
      }))
      expect(posts.find(post => post.path === '/posts/markdown/markdown')?.stem).toBe('posts/1.markdown/01.markdown')
      expect(sortPosts(posts).map(post => post.path)).toEqual([
        '/posts/guide/installation',
        '/posts/markdown/markdown',
        '/posts',
        '/posts/markdown/_getting-started',
        '/posts/notes',
      ])
      expect(db.prepare('SELECT path FROM _content_about').get()?.path).toBe('/about')
      expect(db.prepare('SELECT path, title, description FROM _content_use').all()).toEqual([
        { path: '/use', title: 'Use', description: '我的装备' },
      ])
      expect(db.prepare('SELECT title, publish, pin, theme FROM _content_posts LIMIT 1').get()).toMatchObject({
        title: '测试文章',
        publish: '2024-02-29',
        pin: 0,
        theme: '#a369ff',
      })
    }
    finally {
      db.close()
    }
  }
  finally {
    await fixture.close()
  }
}, 60_000)

test.each([
  'posts/posts/2.markdown/99.markdown.md',
  'posts/posts/1.markdown/markdown/index.md',
])('拒绝默认规范化后产生的路径冲突：%s', async (id) => {
  const fixture = await setup(false, id)
  try {
    await expect(fixture.build()).rejects.toThrow(/UNIQUE constraint failed: _content_posts.path/)
  }
  finally {
    await fixture.close()
  }
}, 30_000)
