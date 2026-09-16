import { defineStatsHandler } from '../../features/stats/handler'
import { withStats } from '../../features/stats/http'

export default defineStatsHandler(event => withStats(event, repository => repository.summary()))
