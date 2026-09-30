import { defineAssistantHandler } from '../../../../features/assistant/http'
import { claimRoute } from '../../../../features/assistant/service'

export default defineAssistantHandler(claimRoute)
