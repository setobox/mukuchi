import type { H3Event } from 'h3'
import { z } from 'zod'
import { AdminError } from '../../../shared/admin/model'
import { readAdminJson, withAdmin } from '../admin/http'
import { assistantConfiguration, withAssistant } from '../assistant/http'
import { createAudioRepository } from '../audio/repository'
import { requireOwner } from '../auth/session'
import { decryptApiKey } from './crypto'
import { withAi } from './service'

const fields = ['apiKey', 'modelKey', 'aliyunKeyId', 'aliyunKeySecret', 'turnstileSecret'] as const
export async function revealCredential(event: H3Event, service: 'ai' | 'audio' | 'assistant') {
  await requireOwner(event)
  setResponseHeader(event, 'cache-control', 'private, no-store')
  const { field } = z.object({ field: z.enum(fields) }).strict().parse(await readAdminJson(event))
  if (service === 'assistant') {
    if (field === 'apiKey')
      throw new AdminError(400, '凭据字段无效')
    return withAssistant(event, async (repository) => {
      const config = await assistantConfiguration(event, repository, false)
      return { field, value: config.credentials[field] }
    })
  }
  if (field !== 'apiKey')
    throw new AdminError(400, '凭据字段无效')
  const stored = service === 'ai'
    ? await withAi(event, repo => repo.settings())
    : await withAdmin(event, repo => createAudioRepository({ batch: repo.batch, close() {} }).settings())
  return { field, value: stored.encryptedKey ? await decryptApiKey(stored.encryptedKey, String(useRuntimeConfig(event).aiEncryptionKey || '')) : '' }
}
