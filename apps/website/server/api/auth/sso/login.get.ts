import { defineAuthHandler } from '../../../features/auth/http'
import { startLogin } from '../../../features/auth/oauth'

export default defineAuthHandler(startLogin)
