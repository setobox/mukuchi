import { defineAuthHandler } from '../../../features/auth/http'
import { verifyEmail } from '../../../features/auth/verification'

export default defineAuthHandler(verifyEmail)
