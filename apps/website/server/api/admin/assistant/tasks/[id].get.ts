import { z } from 'zod'
import { defineAssistantHandler, withAssistant } from '../../../../features/assistant/http'
import { requireOwner } from '../../../../features/auth/session'

export default defineAssistantHandler(async (event) => {
  await requireOwner(event)
  const id = z.uuid().parse(getRouterParam(event, 'id'))
  return withAssistant(event, async (repository) => {
    await repository.tasks.maintain(Date.now())
    return repository.tasks.detail(id)
  })
})
