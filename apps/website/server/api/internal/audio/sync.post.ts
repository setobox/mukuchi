import { defineAdminHandler } from '../../../features/admin/http'
import { audioSyncRoute } from '../../../features/audio/http'

export default defineAdminHandler(audioSyncRoute)
