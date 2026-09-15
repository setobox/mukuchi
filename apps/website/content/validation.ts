import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseDocument } from 'yaml'
import { aboutFields, postSchema } from '../shared/content/schema.ts'

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

export function readFrontmatter(source: string, filename: string): unknown {
  const lines = source.replace(/^\uFEFF/, '').split(/\r?\n/)
  const delimiter = /^---[ \t]*$/
  const end = lines.findIndex((line, index) => index > 0 && delimiter.test(line))
  if (!delimiter.test(lines[0] ?? '') || end < 0)
    throw new Error(`${filename}：缺少 YAML frontmatter`)
  const document = parseDocument(lines.slice(1, end).join('\n'), { uniqueKeys: true })
  if (document.errors.length)
    throw new Error(`${filename}：${document.errors.map(error => error.message).join('；')}`)
  return document.toJS({ maxAliasCount: 20 }) as unknown
}
export function validateFrontmatter(source: string, filename: string, kind: 'posts' | 'about') {
  const result = (kind === 'posts' ? postSchema : aboutFields).safeParse(
    readFrontmatter(source, filename),
  )
  if (!result.success) {
    throw new Error(
      `${filename}：${result.error.issues
        .map(issue => `${issue.path.join('.')} ${issue.message}`)
        .join('；')}`,
    )
  }
  return result.data
}
