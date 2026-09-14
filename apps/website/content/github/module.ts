import type { RepositorySnapshots } from '../../shared/github/repository'
import { readdir, readFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { addTemplate, defineNuxtModule, updateTemplates } from 'nuxt/kit'
import { contentRoot, postsRoot } from '../validation'
import { collectRepositories } from './scan'
import { createSnapshotCollector } from './snapshots'

export default defineNuxtModule({
  meta: { name: 'mukuchi-github-snapshots' },
  setup(_, nuxt) {
    let snapshots: RepositorySnapshots = {}
    let pending = Promise.resolve()
    const enabled = !nuxt.options._prepare && !nuxt.options.test
    const template = addTemplate({
      filename: 'github-repositories.ts',
      write: true,
      getContents: () => `import type { RepositorySnapshots } from '#shared/github/repository'\nexport default ${JSON.stringify(snapshots)} satisfies RepositorySnapshots\n`,
    })
    nuxt.options.alias['#github-snapshots'] = template.dst
    if (!enabled)
      return

    const collect = createSnapshotCollector({
      fetch: globalThis.fetch,
      token: process.env.MUKUCHI_GITHUB_TOKEN,
      warn: message => console.warn(`[GitHub 快照] ${message}`),
    })
    async function readSnapshots() {
      const files: string[] = [join(contentRoot, 'about.md')]
      async function walk(directory: string) {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
          const path = join(directory, entry.name)
          if (entry.isDirectory())
            await walk(path)
          else if (entry.isFile() && entry.name.endsWith('.md'))
            files.push(path)
        }
      }
      await walk(postsRoot)
      const sources = await Promise.all(files.map(async filename => ({ filename, source: await readFile(filename, 'utf8') })))
      const repos = await collectRepositories(sources)
      snapshots = await collect(repos)
    }
    // Await before template compilation: validation errors must stop a production build.
    nuxt.hook('app:templates', () => {
      const refresh = pending.then(readSnapshots)
      pending = refresh.catch(() => {})
      return refresh
    })
    if (nuxt.options.dev) {
      // Nuxt's Chokidar watcher accepts directories, not glob patterns.
      nuxt.options.watch.push(contentRoot)
      nuxt.hook('builder:watch', async (_, path) => {
        const filename = isAbsolute(path) ? path : resolve(nuxt.options.srcDir, path)
        const local = relative(contentRoot, filename)
        if (local.startsWith('..') || isAbsolute(local) || !filename.endsWith('.md'))
          return
        await updateTemplates({ filter: candidate => candidate.dst === template.dst }).catch((error: unknown) => {
          console.error(error instanceof Error ? error.message : 'GitHub 卡片内容校验失败')
        })
      })
      nuxt.hook('close', () => pending)
    }
  },
})
