import { restoreHistoryRoute } from '../../../../features/assistant/history-service'
import { defineAssistantHandler } from '../../../../features/assistant/http'

export default defineAssistantHandler(restoreHistoryRoute)
