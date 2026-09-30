import type { SearchDocument } from '../content/search'

const aliases: readonly (readonly string[])[] = [
  ['typescript', 'ts'],
  ['javascript', 'js'],
  ['vue3', 'vue 3', 'vue.js 3'],
  ['vue2', 'vue 2', 'vue.js 2'],
  ['node.js', 'nodejs', 'node'],
  ['llm', '大语言模型', '大模型'],
  ['rag', '检索增强生成'],
  ['ai', '人工智能'],
  ['cli', '命令行'],
  ['部署', '发布上线'],
  ['性能', '优化速度'],
  ['indexeddb', '索引数据库'],
]
const stopWords = new Set(['的', '了', '吗', '呢', '我', '你', '请', '想', '找', '一下', '有没有', '关于', '有关', '文章', '介绍', '一些', '如何', '怎么', '可以', '帮', '帮我'])
function normalize(value: string) {
  return value.normalize('NFKC').toLowerCase().replace(/vue\s*([23])/g, 'vue$1')
}
function containsTerm(field: string, term: string) {
  if (!/^[a-z\d .]+$/.test(term))
    return field.includes(term)
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?<![a-z\\d.])${escaped}(?![a-z\\d])`).test(field)
}
export function recallTerms(query: string): string[][] {
  const normalized = normalize(query)
  const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'word' })
  const words = [...segmenter.segment(normalized)].filter(part => part.isWordLike).map(part => part.segment)
  const groups: string[][] = []
  const used = new Set<string>()
  for (const alias of aliases) {
    if (alias.some(term => containsTerm(normalized, normalize(term)))) {
      groups.push(alias.map(normalize))
      for (const term of alias) {
        for (const part of segmenter.segment(normalize(term))) used.add(part.segment)
      }
    }
  }
  for (const word of words) {
    if (used.has(word) || stopWords.has(word))
      continue
    used.add(word)
    const alias = aliases.find(group => group.some(term => normalize(term) === word))
    groups.push(alias ? alias.map(normalize) : [word])
    if (groups.length === 12)
      break
  }
  return groups.slice(0, 12)
}
export function recallArticles(documents: readonly SearchDocument[], query: string, options: { limit: number, category?: string | null, tag?: string | null }) {
  const groups = recallTerms(query)
  if (!groups.length)
    return []
  const matches = new Map<string, { document: SearchDocument, score: number }>()
  for (const document of documents) {
    if (options.category && !document.categories.includes(options.category))
      continue
    if (options.tag && !document.tags.includes(options.tag))
      continue
    const fields = [document.articleTitle, [...document.tags, ...document.categories].join(' '), document.title, document.description, document.content].map(normalize)
    const positions = groups.map(group => fields.findIndex(field => group.some(term => containsTerm(field, term))))
    const hits = positions.filter(position => position !== -1)
    if (!hits.length || hits.length < Math.ceil(groups.length * 0.6))
      continue
    const score = hits.reduce((sum, position) => sum + [80, 50, 30, 10, 1][position]!, 0) * hits.length / groups.length
    if ((matches.get(document.path)?.score ?? -1) < score)
      matches.set(document.path, { document, score })
  }
  return [...matches.values()].sort((a, b) => b.score - a.score || a.document.path.localeCompare(b.document.path)).slice(0, options.limit).map(item => item.document)
}
