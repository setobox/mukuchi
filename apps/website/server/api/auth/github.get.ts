import { defineAdminHandler } from '../../features/admin/http'
import { startOAuth } from '../../features/auth/oauth'

export default defineAdminHandler(startOAuth)
