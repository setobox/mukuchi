import { defineAdminHandler } from '../../features/admin/http'
import { publicAudioRoute } from '../../features/audio/http'

export default defineAdminHandler(publicAudioRoute)
