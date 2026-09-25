import type { SummarySnapshot } from '../../shared/ai/model.ts'
import { readdir, readFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineCollectionSource } from '@nuxt/content'
import { parseDocument } from 'yaml'
import { digest, matchingSummary, normalizeSummaryInput, summarySnapshotSchema } from '../../shared/ai/model.ts'
import { splitDocument } from '../../shared/content/document.ts'

export const summarySnapshotPath = fileURLToPath(new URL('../../.data/ai/summary-snapshot.json', import.meta.url))
export async function markdownFiles(root: string): Promise<string[]> {
  const files: string[] = []
  async function walk(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory())
        await walk(path)
      else if (entry.isFile() && entry.name.endsWith('.md'))
        files.push(relative(root, path).replace(/\\/g, '/'))
    }
  }
  await walk(root)
  return files.sort()
}
export async function readSnapshot() {
  try {
    return summarySnapshotSchema.parse(JSON.parse(await readFile(summarySnapshotPath, 'utf8')))
  }
  catch { return null }
}
export async function applySummarySnapshot(source: string, path: string, snapshot?: SummarySnapshot | null) {
  snapshot = snapshot === undefined ? await readSnapshot() : snapshot
  const record = snapshot?.records[path]
  const parts = splitDocument(source)
  const yaml = parseDocument(parts.yaml)
  if (!parts.header || yaml.errors.length)
    return source
  // Computed fields are always overwritten; source frontmatter cannot claim AI provenance.
  yaml.set('summarySource', 'description')
  const title: unknown = yaml.get('title')
  if (yaml.get('aiSummary') !== false && typeof title === 'string' && record) {
    const inputHash = await digest(normalizeSummaryInput(title, parts.body))
    if (matchingSummary(record, inputHash, snapshot!.configHash)) {
      yaml.set('description', record.text)
      yaml.set('summarySource', 'ai')
    }
  }
  // This transformed string is hashed by Content before its parse cache lookup.
  return `---\n${yaml.toString()}---\n${parts.body}`
}
export function summaryContentSource(root: string) {
  const source = defineCollectionSource({
    getKeys: () => markdownFiles(root),
    async getItem(key) {
      const path = resolve(root, key)
      const local = relative(root, path)
      if (local.startsWith('..') || isAbsolute(local))
        throw new Error('文章路径超出内容目录')
      return applySummarySnapshot(await readFile(path, 'utf8'), key)
    },
  })
  return { ...source, cwd: root.replace(/\\/g, '/'), include: '**/*.md', prefix: '/posts' }
}
