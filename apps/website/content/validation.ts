import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateFrontmatter } from '../shared/content/document.ts'

export { readFrontmatter, validateFrontmatter } from '../shared/content/document.ts'

export const contentRoot = fileURLToPath(new URL('../../../content/', import.meta.url))
export const postsRoot = join(contentRoot, 'posts')

export async function validateContentDirectory(options: { root?: string, onInvalid?: (message: string) => void } = {}) {
  const root = options.root ?? contentRoot
  async function validate(filename: string, kind: 'posts' | 'about' | 'use') {
    const source = await readFile(filename, 'utf8')
    try {
      validateFrontmatter(source, filename, kind)
    }
    catch (error) {
      if (!options.onInvalid)
        throw error
      options.onInvalid(error instanceof Error ? error.message : `${filename}：元数据无效`)
    }
  }
  async function walk(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const filename = join(directory, entry.name)
      if (entry.isDirectory()) {
        await walk(filename)
      }
      else if (entry.isFile() && entry.name.endsWith('.md')) {
        await validate(filename, 'posts')
      }
    }
  }
  await walk(join(root, 'posts'))
  for (const kind of ['about', 'use'] as const) {
    await validate(join(root, `${kind}.md`), kind)
  }
}
