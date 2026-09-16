import { defineAdminHandler } from '../../../features/admin/http'
import { settingsRoute } from '../../../features/ai/service'

export default defineAdminHandler(settingsRoute)
