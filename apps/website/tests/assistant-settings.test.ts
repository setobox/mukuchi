import type { H3Event } from 'h3'
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { encryptApiKey } from '../server/features/ai/crypto'
import { canonicalJson, digest } from '../server/features/assistant/crypto'
import { assistantConfiguration, configurationHash } from '../server/features/assistant/http'
import { assistantCredentialsSchema, defaultAssistantSettings } from '../shared/assistant/settings'
import { assistantDatabase } from './fixtures/assistant-database'

afterEach(() => vi.unstubAllGlobals())
const credentials = assistantCredentialsSchema.parse({ modelKey: 'fixture-key', aliyunKeyId: 'fixture-id', aliyunKeySecret: 'fixture-secret', turnstileSecret: 'fixture-turnstile' })
const settings = { ...defaultAssistantSettings, enabled: true, model: 'test-model', baseUrl: 'https://model.example.com/v1', turnstileSiteKey: 'fixture-site' }

test('旧设置保留但流式协议需要重测；次数及废弃输出审核配置无需重测', async () => {
  const { repository, db, connection } = assistantDatabase()
  try {
    const secret = btoa('a'.repeat(32))
    vi.stubGlobal('useRuntimeConfig', () => ({ aiEncryptionKey: secret, assistantEnabled: false }))
    const legacy = { ...settings, dailyBudgetMicros: 1, inputPriceMicrosPerMillion: 200, outputPriceMicrosPerMillion: 300, moderationPriceMicros: 400 }
    const hash = await digest(canonicalJson({ settings: { ...legacy, enabled: false }, credentials }))
    await repository.saveSettings(settings, await encryptApiKey(JSON.stringify(credentials), secret), 0, hash)
    db.prepare('UPDATE assistant_settings SET config = ?').run(JSON.stringify(legacy))
    const previous = await assistantConfiguration({} as H3Event, repository, false)
    expect(previous.ready).toBe(false)
    expect(previous.settings).not.toHaveProperty('dailyBudgetMicros')
    await repository.markVerified(1, await configurationHash(settings, credentials))
    const config = await assistantConfiguration({} as H3Event, repository)
    expect(config.ready).toBe(true)
    expect(config.settings).not.toHaveProperty('dailyBudgetMicros')
    expect(config.verifiedHash).toBe(await configurationHash(settings, credentials))
    expect(await configurationHash({ ...settings, guestDay: 100, enabled: false }, credentials)).toBe(config.verifiedHash)
    expect(await configurationHash({ ...settings, responseService: 'response_security_check_pro_unused' }, credentials)).toBe(config.verifiedHash)
    expect(await configurationHash({ ...settings, model: 'changed' }, credentials)).not.toBe(config.verifiedHash)
    expect(await configurationHash(settings, { ...credentials, modelKey: 'changed' })).not.toBe(config.verifiedHash)
  }
  finally { connection.close() }
})
