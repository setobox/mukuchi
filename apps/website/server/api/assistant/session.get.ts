import { defineAssistantHandler } from '../../features/assistant/http'
import { sessionRoute } from '../../features/assistant/service'

export default defineAssistantHandler(sessionRoute)
