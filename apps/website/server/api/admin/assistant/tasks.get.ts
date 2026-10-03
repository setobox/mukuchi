import { taskQuerySchema } from '../../../../shared/assistant/tasks'
import { defineAssistantHandler, withAssistant } from '../../../features/assistant/http'
import { requireOwner } from '../../../features/auth/session'

export default defineAssistantHandler(async (event) => {
  await requireOwner(event)
  const input = taskQuerySchema.parse(getQuery(event))
  return withAssistant(event, async (repository) => {
    await repository.tasks.maintain(Date.now())
    return repository.tasks.list(input)
  })
})
