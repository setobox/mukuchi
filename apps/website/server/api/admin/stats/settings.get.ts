import { defineAdminHandler } from '../../../features/admin/http'
import { statsSettingsRoute } from '../../../features/stats/settings'

export default defineAdminHandler(statsSettingsRoute)
