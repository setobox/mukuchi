import { defineAdminHandler } from '../../../features/admin/http'
import { audioSettingsRoute } from '../../../features/audio/http'

export default defineAdminHandler(audioSettingsRoute)
