import { defineAdminHandler } from '../../features/admin/http'
import { finishOAuth } from '../../features/auth/oauth'

export default defineAdminHandler(finishOAuth)
