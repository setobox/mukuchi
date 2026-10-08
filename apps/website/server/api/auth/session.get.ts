import { defineAuthHandler } from '../../features/auth/http'
import { isLocal, session } from '../../features/auth/session'
import { ssoAvailable } from '../../features/auth/settings'

export default defineAuthHandler(async (event) => {
  const current = await session(event)
  return { user: current?.user ?? null, loginProvider: current?.loginProvider ?? null, csrf: current?.csrf ?? null, localAvailable: isLocal(event), ssoAvailable: ssoAvailable(event), ssoLinked: current?.ssoLinked ?? false, centralLogoutAvailable: current?.centralLogoutAvailable ?? false }
})
