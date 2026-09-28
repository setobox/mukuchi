import { defineAuthHandler } from '../../features/auth/http'
import { logout } from '../../features/auth/session'

export default defineAuthHandler(async (event) => {
  await logout(event)
  return { ok: true }
})
