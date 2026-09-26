import { parseMarkdown } from '@nuxtjs/mdc/runtime'
import { splitDocument } from '../shared/content/document.ts'
import { countReadingWords } from '../shared/content/reading.ts'

export async function markdownWordCount(source: string): Promise<number> {
  const parsed = await parseMarkdown(splitDocument(source).body, { highlight: false, toc: false, contentHeading: false })
  return countReadingWords(parsed.body)
}
