export interface SafeInline { type: 'text' | 'code' | 'strong', text: string }
export interface SafeParagraph { type: 'paragraph' | 'code' | 'list', lines: SafeInline[][] }

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
  let code = false
  for (const line of value.split('\n')) {
    if (line.startsWith('```')) {
      code = !code
      if (code)
        blocks.push({ type: 'code', lines: [] })
      continue
    }
    if (code)
      blocks.at(-1)!.lines.push([{ type: 'text', text: line }])
    else if (/^\s*(?:[-*]|\d+\.)\s+/.test(line))
      blocks.push({ type: 'list', lines: [inlineMarkdown(line.replace(/^\s*(?:[-*]|\d+\.)\s+/, ''))] })
    else if (line.trim())
      blocks.push({ type: 'paragraph', lines: [inlineMarkdown(line.replace(/^#{1,6}\s+/, ''))] })
  }
  return blocks
}
