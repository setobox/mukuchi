import { defineStatsHandler } from '../../features/stats/handler'
import { requireStats, requireStatsPath, withStats } from '../../features/stats/http'

export default defineStatsHandler(async (event) => {
  requireStats(event)
  const path = await requireStatsPath(event, getQuery(event).path)
  return withStats(event, repository => repository.page(path))
})
