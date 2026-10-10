import { z } from 'zod'

function safeSegments(path: string): boolean {
  try {
    const decoded = decodeURIComponent(path)
    return !/[\s?#\\\p{Cc}]/u.test(decoded) && !decoded.split('/').some(part => part === '.' || part === '..')
  }
  catch { return false }
}
export const articlePathSchema = z.string().max(500).regex(/^\/posts\/[^?#\\\s]+$/).refine(safeSegments, '文章地址无效')
export const articleImageSchema = z.string().max(1000).regex(/^\/images\/[^?#\\\s]+$/).refine(safeSegments, '文章图片地址无效')
