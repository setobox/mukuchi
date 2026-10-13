import type { H3Event } from 'h3'
import { z } from 'zod'
import { historyImportSchema, historyMutationSchema, historyRestoreSchema } from '../../../shared/assistant/history'
import { AssistantError } from '../../../shared/assistant/model'
import { signTurn, verifyHistory } from './crypto'
import { anonymousActor, assistantIdentity, assistantJson, assistantSecret, withAssistant } from './http'

async function identity(event: H3Event, write = false) {
  const value = await assistantIdentity(event, write)
  if (!value.authenticated)
    throw new AssistantError(401, 'login_required', '请登录后同步会话')
  return value
}
const cursor = (event: H3Event) => z.uuid().nullable().parse(getQuery(event).cursor ?? null)
const id = (event: H3Event) => z.uuid().parse(getRouterParam(event, 'id'))
export async function conversationsRoute(event: H3Event) {
  const account = await identity(event)
  return withAssistant(event, repository => repository.history.list(account.actor, cursor(event)))
}
export async function messagesRoute(event: H3Event) {
  const account = await identity(event)
  return withAssistant(event, repository => repository.history.messages(account.actor, id(event), cursor(event)))
}
export async function importHistoryRoute(event: H3Event) {
  const account = await identity(event, true)
  const input = historyImportSchema.parse(await assistantJson(event))
  const source = input.source === 'anonymous' ? await anonymousActor(event) : account.actor
  const secret = assistantSecret(event)
  const checked = await verifyHistory(secret, source, input.conversationId, input.records)
  const records = input.source === 'anonymous' ? await Promise.all(checked.map(({ proof: _proof, ...record }) => signTurn(secret, account.actor, record))) : checked
  return withAssistant(event, async repository => ({ conversation: await repository.history.import(account.actor, source, input.conversationId, records, input.messages) }))
}
export async function removeHistoryRoute(event: H3Event) {
  const account = await identity(event, true)
  const input = historyMutationSchema.parse(await assistantJson(event))
  return withAssistant(event, async repository => ({ conversation: await repository.history.remove(account.actor, id(event), input.version) }))
}
export async function clearHistoryRoute(event: H3Event) {
  const account = await identity(event, true)
  return withAssistant(event, async (repository) => {
    await repository.history.clear(account.actor)
    return { cleared: true }
  })
}
export async function restoreHistoryRoute(event: H3Event) {
  const account = await identity(event, true)
  const input = historyRestoreSchema.parse(await assistantJson(event))
  const records = await verifyHistory(assistantSecret(event), account.actor, id(event), input.records)
  return withAssistant(event, async repository => ({ conversation: await repository.history.restore(account.actor, id(event), input.version, records, input.messages) }))
}
