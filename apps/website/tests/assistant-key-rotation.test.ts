import type { H3Event } from 'h3'
import { afterEach, expect, it, vi } from 'vitest'
import { decryptApiKey, encryptApiKey } from '../server/features/ai/crypto'
import { assistantSettingsRoute } from '../server/features/assistant/admin'
import { assistantConfiguration } from '../server/features/assistant/http'
import { defaultAssistantSettings } from '../shared/assistant/settings'
import { assistantDatabase } from './fixtures/assistant-database'

const state = vi.hoisted(() => ({ repository: null as ReturnType<typeof assistantDatabase>['repository'] | null, body: {} as unknown, authorized: true }))
vi.mock('../server/features/auth/session', () => ({ requireOwner: async () => {
  if (!state.authorized)
    throw new Error('unauthorized')
  return { user: { id: 'owner' } }
} }))
vi.mock('../server/features/assistant/http', async original => ({
  ...await original<typeof import('../server/features/assistant/http')>(),
  assistantJson: async () => state.body,
  withAssistant: async (_event: H3Event, operation: (repo: NonNullable<typeof state.repository>) => Promise<unknown>) => operation(state.repository!),
}))
afterEach(() => vi.unstubAllGlobals())

it('rotated assistant keys allow owner replacement without exposing, clearing or enabling old credentials', async () => {
  const fixture = assistantDatabase()
  const oldKey = btoa('a'.repeat(32))
  const newKey = btoa('b'.repeat(32))
  const credentials = { modelKey: 'new-model-key', aliyunKeyId: 'new-id', aliyunKeySecret: 'new-secret', turnstileSecret: 'new-turnstile' }
  const settings = { ...defaultAssistantSettings, enabled: true, baseUrl: 'https://model.example.com/v1', model: 'fixture', turnstileSiteKey: 'site' }
  const event = { method: 'GET', context: {} } as H3Event
  try {
    state.repository = fixture.repository
    state.authorized = true
    const ciphertext = await encryptApiKey(JSON.stringify({ ...credentials, modelKey: 'old-private-key' }), oldKey)
    await fixture.repository.saveSettings(settings, ciphertext, 0, 'old-verification')
    vi.stubGlobal('useRuntimeConfig', () => ({ aiEncryptionKey: newKey }))
    const fetcher = vi.fn(() => {
      throw new Error('No provider calls allowed')
    })
    vi.stubGlobal('fetch', fetcher)
    const view = await assistantSettingsRoute(event)
    expect(view).toMatchObject({ settings: { enabled: false, model: 'fixture' }, version: 1, configured: { modelKey: false, aliyunKeyId: false, aliyunKeySecret: false, turnstileSecret: false }, verified: false, encryptionReady: true })
    expect(JSON.stringify(view)).not.toContain(ciphertext)
    expect((await fixture.repository.settings()).encryptedCredentials).toBe(ciphertext)
    vi.stubGlobal('useRuntimeConfig', () => ({ aiEncryptionKey: 'invalid' }))
    await expect(assistantSettingsRoute(event)).rejects.toThrow('尚未配置')
    vi.stubGlobal('useRuntimeConfig', () => ({ aiEncryptionKey: newKey }))
    await expect(assistantConfiguration(event, fixture.repository)).rejects.toThrow('无法解密')
    state.authorized = false
    await expect(assistantSettingsRoute(event)).rejects.toThrow('unauthorized')
    state.authorized = true
    event.method = 'PUT'
    for (const body of [
      { settings: { ...settings, enabled: false }, version: 0, credentials },
      { settings: { ...settings, enabled: false }, version: 1, credentials: { modelKey: 'partial' } },
      { settings, version: 1, credentials },
      { settings: { ...settings, enabled: false }, version: 1, credentials, clearCredentials: ['modelKey'] },
    ]) {
      state.body = body
      await expect(assistantSettingsRoute(event)).rejects.toThrow()
      expect((await fixture.repository.settings()).encryptedCredentials).toBe(ciphertext)
    }
    state.body = { settings: { ...settings, enabled: false }, version: 1, credentials }
    expect(await assistantSettingsRoute(event)).toMatchObject({ version: 2, verified: false, configured: { modelKey: true } })
    const stored = await fixture.repository.settings()
    expect(stored.settings.enabled).toBe(false)
    expect(stored.verifiedHash).toBe('')
    expect(JSON.parse(await decryptApiKey(stored.encryptedCredentials, newKey))).toEqual(credentials)
    await expect(assistantConfiguration(event, fixture.repository)).rejects.toThrow('暂未开放')
    expect(fetcher).not.toHaveBeenCalled()
  }
  finally { fixture.connection.close() }
})
