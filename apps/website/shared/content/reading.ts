interface ReadingNode {
  type: string
  tag?: string
  value?: string
  children?: ReadingNode[]
}

const excluded = new Set(['pre', 'script', 'style', 'svg', 'img', 'binding'])
const inline = new Set(['a', 'span', 'strong', 'em', 'del', 's', 'b', 'i', 'u', 'code', 'sub', 'sup', 'mark', 'abbr', 'text-component'])

function readingText(node: ReadingNode): string {
  if (node.type === 'text')
    return node.value ?? ''
  const tag = (node.tag ?? '').toLowerCase().replace(/^prose-/, '')
  if (excluded.has(tag))
    return ' '
  const text = (node.children ?? []).map(readingText).join('')
  // Inline formatting must not split a word, while adjacent blocks need a boundary.
  return inline.has(tag) ? text : ` ${text} `
}

export function countReadingWords(body: ReadingNode): number {
  const text = readingText(body)
  const chinese = text.match(/\p{Script=Han}/gu)?.length ?? 0
  const words = text.replace(/\p{Script=Han}/gu, ' ').match(/[\p{L}\p{N}][\p{L}\p{N}\p{M}]*(?:['’][\p{L}\p{N}][\p{L}\p{N}\p{M}]*)*/gu)?.length ?? 0
  return chinese + words
}

export function readingMinutes(wordCount: number): number {
  return Math.ceil(wordCount / 200)
}
