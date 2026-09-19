import { defineAdminHandler } from '../../../features/admin/http'
import { audioJobsRoute } from '../../../features/audio/http'

export default defineAdminHandler(audioJobsRoute)
