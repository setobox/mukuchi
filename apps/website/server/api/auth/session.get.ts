import { defineAdminHandler } from '../../features/admin/http'
import { isLocal, session } from '../../features/auth/session'

export default defineAdminHandler(async (event) => {
  const current = await session(event)
  const config = useRuntimeConfig(event)
  return { user: current?.user ?? null, csrf: current?.csrf ?? null, localAvailable: isLocal(event), loginAvailable: !!config.githubClientId && !!config.githubClientSecret }
})
