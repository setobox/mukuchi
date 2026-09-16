import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateFrontmatter } from '../shared/content/document.ts'

export { readFrontmatter, validateFrontmatter } from '../shared/content/document.ts'

export const contentRoot = fileURLToPath(new URL('../../../content/', import.meta.url))
export const postsRoot = join(contentRoot, 'posts')

export async function validateContentDirectory() {
  async function walk(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const filename = join(directory, entry.name)
      if (entry.isDirectory()) {
        await walk(filename)
      }
      else if (entry.isFile() && entry.name.endsWith('.md')) {
        validateFrontmatter(await readFile(filename, 'utf8'), filename, 'posts')
      }
    }
  }
  await walk(postsRoot)
  const about = join(contentRoot, 'about.md')
  validateFrontmatter(await readFile(about, 'utf8'), about, 'about')
}
