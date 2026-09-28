import { defineAuthHandler } from '../../../features/auth/http'
import { resendVerification } from '../../../features/auth/verification'

export default defineAuthHandler(resendVerification)
