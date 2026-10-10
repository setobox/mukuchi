export interface SafeInline { type: 'text' | 'code' | 'strong', text: string }
export interface SafeParagraph { type: 'paragraph' | 'code' | 'list' | 'heading' | 'quote' | 'table', lines: SafeInline[][], level?: number, ordered?: boolean, header?: SafeInline[][], rows?: SafeInline[][][] }

// A deliberately small Markdown subset. HTML, links, images and MDC remain inert text.
export function inlineMarkdown(value: string): SafeInline[] {
  const pattern = /(`[^`\n]+`|\*\*[^*\n]+\*\*)/g
  const parts: SafeInline[] = []
  let index = 0
  for (const match of value.matchAll(pattern)) {
    if (match.index > index)
      parts.push({ type: 'text', text: value.slice(index, match.index) })
    const code = match[0].startsWith('`')
    parts.push({ type: code ? 'code' : 'strong', text: match[0].slice(code ? 1 : 2, code ? -1 : -2) })
    index = match.index + match[0].length
  }
  if (index < value.length)
    parts.push({ type: 'text', text: value.slice(index) })
  return parts
}
export function safeMarkdown(value: string): SafeParagraph[] {
  const blocks: SafeParagraph[] = []
  const lines = value.split('\n')
  const cells = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').map(value => inlineMarkdown(value.trim()))
  let code = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (line.startsWith('```')) {
      code = !code
      if (code)
        blocks.push({ type: 'code', lines: [] })
      continue
    }
    if (code) {
      blocks.at(-1)!.lines.push([{ type: 'text', text: line }])
      continue
    }
    if (!line.trim())
      continue
    const divider = (lines[i + 1] ?? '').trim().replace(/^\||\|$/g, '').split('|')
    if (line.includes('|') && divider.length > 1 && divider.every(cell => /^:?-{3,}:?$/.test(cell.trim()))) {
      const block: SafeParagraph = { type: 'table', lines: [], header: cells(line), rows: [] }
      i++
      while (lines[i + 1]?.includes('|')) block.rows!.push(cells(lines[++i]!))
      blocks.push(block)
      continue
    }
    const heading = /^(#{1,6})\s+(\S.*)$/.exec(line)
    const list = /^\s*([-*]|\d+\.)\s+(\S.*)$/.exec(line)
    if (heading) {
      blocks.push({ type: 'heading', level: Math.min(heading[1]!.length + 1, 6), lines: [inlineMarkdown(heading[2]!)] })
    }
    else if (list) {
      const ordered = /\d/.test(list[1]!)
      const previous = blocks.at(-1)
      if (previous?.type === 'list' && previous.ordered === ordered && lines[i - 1]?.trim())
        previous.lines.push(inlineMarkdown(list[2]!))
      else blocks.push({ type: 'list', ordered, lines: [inlineMarkdown(list[2]!)] })
    }
    else if (/^>\s?/.test(line)) {
      blocks.push({ type: 'quote', lines: [inlineMarkdown(line.replace(/^>\s?/, ''))] })
    }
    else {
      blocks.push({ type: 'paragraph', lines: [inlineMarkdown(line)] })
    }
  }
  return blocks
}
