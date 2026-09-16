import { AdminError } from '../../../shared/admin/model'
import { defineAdminHandler, requireOrigin } from '../../features/admin/http'
import { createSession, isLocal } from '../../features/auth/session'

export default defineAdminHandler(async (event) => {
  requireOrigin(event)
  if (!isLocal(event) || getHeader(event, 'x-admin-request') !== '1')
    throw new AdminError(403, '仅本机开发环境可使用此入口')
  await createSession(event, { id: Number(useRuntimeConfig(event).adminOwnerId), login: '本地站主', avatar: '', local: true })
  return { ok: true }
})
