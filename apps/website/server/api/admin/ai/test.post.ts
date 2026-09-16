import { defineAdminHandler } from '../../../features/admin/http'
import { testConnection } from '../../../features/ai/service'

export default defineAdminHandler(testConnection)
