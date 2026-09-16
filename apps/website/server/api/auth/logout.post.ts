import { defineAdminHandler } from '../../features/admin/http'
import { logout } from '../../features/auth/session'

export default defineAdminHandler(async (event) => {
  await logout(event)
  return { ok: true }
})
