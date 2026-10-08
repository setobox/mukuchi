import { defineAuthHandler } from '../../../features/auth/http'
import { startOAuth } from '../../../features/auth/oauth'

export default defineAuthHandler(event => startOAuth(event, true))
