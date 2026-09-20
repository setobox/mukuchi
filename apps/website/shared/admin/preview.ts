import type { PostMeta } from '../content/schema'

export interface ArticlePreview {
  data: PostMeta & { path: string }
  body: Record<string, unknown>
  toc?: { links: PreviewHeading[] }
}
export interface PreviewHeading {
  id: string
  text: string
  depth: number
  children?: PreviewHeading[]
}
