import { defineAssistantHandler } from '../../features/assistant/http'
import { turnsRoute } from '../../features/assistant/service'

export default defineAssistantHandler(event => turnsRoute(event))
