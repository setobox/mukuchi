import { createParseProcessor } from '@nuxtjs/mdc/runtime'
import { repositoryIdSchema } from '../../shared/github/repository'

export interface ContentSource { filename: string, source: string }
interface MarkdownNode {
  type: string
  name?: string
  attributes?: Record<string, unknown>
  children?: MarkdownNode[]
  position?: { start: { line: number, offset: number }, end: { offset: number } }
}

export async function collectRepositories(files: ContentSource[]): Promise<string[]> {
  const parser = await createParseProcessor({ highlight: false })
  const repos = new Map<string, string>()
  for (const file of files) {
    function visit(node: MarkdownNode) {
      if (node.type === 'code' || node.type === 'inlineCode')
        return
      if (node.name?.toLowerCase() === 'github') {
        const location = `${file.filename}:${node.position?.start.line ?? 1}`
        const parsed = repositoryIdSchema.safeParse(node.attributes?.repo)
        if (!parsed.success)
          throw new Error(`${location}：GitHub 卡片 repo 必须是静态的 owner/name 仓库标识`)
        const source = file.source.slice(node.position?.start.offset, node.position?.end.offset).trimEnd()
        if (node.type !== 'containerComponent' || !/^:{2,}\s*$/.test(source.split(/\r?\n/).at(-1) ?? '') || node.children?.length)
          throw new Error(`${location}：GitHub 卡片必须使用结束标记 ::，且不能包含插槽内容`)
        const key = parsed.data.toLowerCase()
        if (!repos.has(key))
          repos.set(key, parsed.data)
      }
      for (const child of node.children ?? [])
        visit(child)
    }
    visit(parser.parse(file.source) as MarkdownNode)
  }
  return [...repos.values()].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase(), 'en'))
}
