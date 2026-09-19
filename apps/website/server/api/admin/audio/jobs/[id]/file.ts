import { defineAdminHandler } from '../../../../../features/admin/http'
import { audioFileRoute } from '../../../../../features/audio/http'

export default defineAdminHandler(event => audioFileRoute(event, true))
