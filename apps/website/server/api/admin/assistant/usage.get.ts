import { assistantUsageRoute } from '../../../features/assistant/admin'
import { defineAssistantHandler } from '../../../features/assistant/http'

export default defineAssistantHandler(assistantUsageRoute)
