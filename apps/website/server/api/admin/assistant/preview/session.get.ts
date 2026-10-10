import { defineAssistantHandler } from '../../../../features/assistant/http'
import { previewSessionRoute } from '../../../../features/assistant/service'

export default defineAssistantHandler(previewSessionRoute)
