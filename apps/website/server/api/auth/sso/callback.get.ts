import { defineAuthHandler } from '../../../features/auth/http'
import { finishOAuth } from '../../../features/auth/oauth'

export default defineAuthHandler(finishOAuth)
