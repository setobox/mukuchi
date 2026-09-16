import { parseStatsRange } from '../../../shared/stats/model'
import { defineStatsHandler } from '../../features/stats/handler'
import { requireStatsAdmin, withStats } from '../../features/stats/http'

export default defineStatsHandler(async (event) => {
  await requireStatsAdmin(event)
  let range
  try {
    range = parseStatsRange(getQuery(event), Date.now())
  }
  catch {
    throw createError({ statusCode: 400, message: '统计查询范围无效' })
  }
  return withStats(event, repository => repository.report(range))
})
