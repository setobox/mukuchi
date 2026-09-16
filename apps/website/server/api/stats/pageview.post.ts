import { pageviewSchema, uuid, visitorCookie } from '../../../shared/stats/model'
import { defineStatsHandler } from '../../features/stats/handler'
import { requireStats, requireStatsOrigin, requireStatsPath, visitorDigest, withStats } from '../../features/stats/http'

export default defineStatsHandler(async (event) => {
  const config = requireStats(event)
  requireStatsOrigin(event)
  const contentType = getHeader(event, 'content-type')?.split(';', 1)[0]
  if (contentType !== 'application/json')
    throw createError({ statusCode: 415, message: '需要 JSON 请求' })
  if (Number(getHeader(event, 'content-length')) > 4096)
    throw createError({ statusCode: 413, message: '访问事件过大' })
  const raw = await readRawBody(event) ?? ''
  if (new TextEncoder().encode(raw).length > 4096)
    throw createError({ statusCode: 413, message: '访问事件过大' })
  let input: unknown
  try {
    input = JSON.parse(raw)
  }
  catch {
    throw createError({ statusCode: 400, message: '访问事件无效' })
  }
  const body = pageviewSchema.safeParse(input)
  if (!body.success)
    throw createError({ statusCode: 400, message: '访问事件无效' })
  const path = await requireStatsPath(event, body.data.path)
  const cookie = getCookie(event, visitorCookie)
  const visitor = cookie === undefined ? null : uuid.safeParse(cookie)
  if (visitor && !visitor.success)
    throw createError({ statusCode: 400, message: '访客标识无效' })
  // Validate the secret even when this request has no cookie.
  if (typeof config.statsHashSecret !== 'string' || config.statsHashSecret.length < 32)
    throw createError({ statusCode: 503, message: '统计标识配置不可用' })
  const hash = visitor?.success ? await visitorDigest(visitor.data, config.statsHashSecret) : null
  return withStats(event, repository => repository.record({ ...body.data, path }, hash, Date.now()))
})
