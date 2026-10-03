import { defineAdminHandler } from '../../../../features/admin/http'
import { revealCredential } from '../../../../features/ai/credentials'

export default defineAdminHandler(event => revealCredential(event, 'audio'))
