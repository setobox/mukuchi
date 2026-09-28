import { defineAuthHandler } from '../../features/auth/http'
import { availableProviders } from '../../features/auth/providers'
import { isLocal, session } from '../../features/auth/session'
import { verificationInfo } from '../../features/auth/verification'

export default defineAuthHandler(async (event) => {
  const current = await session(event)
  return { user: current?.user ?? null, csrf: current?.csrf ?? null, localAvailable: isLocal(event), providers: availableProviders(event), linkedProviders: current?.linkedProviders ?? [], pendingVerification: await verificationInfo(event) }
})
