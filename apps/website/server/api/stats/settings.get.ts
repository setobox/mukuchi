import { defineStatsHandler } from '../../features/stats/handler'
import { statsSettings } from '../../features/stats/settings'

export default defineStatsHandler(async event => ({ enabled: (await statsSettings(event)).enabled }))
