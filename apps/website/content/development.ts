import { createParseProcessor } from '@nuxtjs/mdc/runtime'
import { stringify } from 'yaml'
import { readFrontmatter, splitDocument, validateFrontmatter } from '../shared/content/document.ts'
import { postSchema } from '../shared/content/schema.ts'
import { isTaxonomyName } from '../shared/content/taxonomy.ts'

export type ContentKind = 'posts' | 'about' | 'use'

interface HeadingNode { type: string, depth?: number, value?: string, children?: HeadingNode[] }
function text(node: HeadingNode): string {
  return node.value ?? node.children?.map(text).join('') ?? ''
}

export async function prepareDevelopmentDocument(source: string, filename: string, kind: ContentKind, fallbackDate: string) {
  const diagnostics: string[] = []
  try {
    return { source, metadata: validateFrontmatter(source, filename, kind), diagnostics }
  }
  catch (error) {
    diagnostics.push(error instanceof Error ? error.message : `${filename}：元数据无效`)
  }

  const { body } = splitDocument(source)
  let metadata: Record<string, unknown> = {}
  try {
    const value = readFrontmatter(source, filename)
    if (value && typeof value === 'object' && !Array.isArray(value))
      metadata = { ...value }
  }
  catch { /* Invalid YAML is replaced, while the body remains intact. */ }
  for (const key of ['path', '_path', 'id', 'stem'])
    delete metadata[key]

  if (typeof metadata.title !== 'string' || !metadata.title.trim()) {
    const processor = await createParseProcessor({ highlight: false })
    // The syntax tree avoids mistaking a heading inside a code fence for a title.
    const tree = processor.parse(body) as HeadingNode
    const heading = tree.children?.find(node => node.type === 'heading' && node.depth === 1)
    metadata.title = (heading && text(heading).trim()) || filename.replaceAll('\\', '/').split('/').at(-1)!.replace(/\.md$/i, '') || '未命名文章'
  }
  metadata.description = typeof metadata.description === 'string' ? metadata.description : ''

  if (kind === 'posts') {
    metadata.wordCount = 0
    for (const field of ['tags', 'categories'] as const) {
      const values = metadata[field]
      metadata[field] = Array.isArray(values) ? values.filter((value): value is string => typeof value === 'string' && isTaxonomyName(value)) : []
    }
    // Use the strict schema's own issues to reset invalid fields. Revalidation
    // also catches dependent fields (for example update after publish changes).
    const defaults = postSchema.parse({ title: metadata.title, description: '', publish: fallbackDate })
    for (let attempt = 0; attempt < 4; attempt++) {
      const result = postSchema.safeParse(metadata)
      if (result.success) {
        metadata = { ...metadata, ...result.data }
        break
      }
      for (const issue of result.error.issues) {
        const field = issue.path[0]
        if (typeof field !== 'string')
          continue
        if (field === 'audio' && issue.path.length > 1 && metadata.audio && typeof metadata.audio === 'object') {
          const audio = { ...metadata.audio } as Record<string, unknown>
          delete audio[String(issue.path[1])]
          metadata.audio = audio
        }
        else if (Object.hasOwn(defaults, field)) {
          metadata[field] = defaults[field as keyof typeof defaults]
        }
        else {
          delete metadata[field]
        }
      }
    }
    // An implementation error must not silently introduce invalid preview data.
    metadata = { ...metadata, ...postSchema.parse(metadata) }
  }
  else {
    metadata.title = String(metadata.title).trim()
    metadata.description = String(metadata.description).trim()
  }

  // Keep custom frontmatter in the source, but only assign schema fields back
  // onto Content's parsed record (custom keys must not replace its body, etc.).
  const data = kind === 'posts' ? postSchema.parse(metadata) : { title: String(metadata.title), description: String(metadata.description) }
  return { source: `---\n${stringify(metadata)}---\n${body}`, metadata: data, diagnostics }
}
