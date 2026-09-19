import type { AiSettings, SummaryRecord } from '../../../shared/ai/model.ts'
import type { AdminRepository } from '../admin/repository.ts'
import { z } from 'zod'
import { AdminError } from '../../../shared/admin/model.ts'
import { aiSettingsSchema, defaultAiSettings, summaryRecordSchema } from '../../../shared/ai/model.ts'

export type AiQuery = AdminRepository['query']
export function createAiRepository(query: AiQuery) {
  return {
    async settings() {
      const [row] = await query('SELECT config, encrypted_key, version FROM admin_ai_settings WHERE id = 1')
      if (!row)
        return { settings: { ...defaultAiSettings }, encryptedKey: '', version: 0 }
      return { settings: aiSettingsSchema.parse(JSON.parse(String(row.config))), encryptedKey: z.string().parse(row.encrypted_key), version: z.number().int().positive().parse(row.version) }
    },
    async saveSettings(settings: AiSettings, encryptedKey: string, version: number) {
      const config = JSON.stringify(aiSettingsSchema.parse(settings))
      const rows = version === 0
        ? await query('INSERT INTO admin_ai_settings (id,config,encrypted_key,version) VALUES (1,?,?,1) ON CONFLICT DO NOTHING RETURNING id', [config, encryptedKey])
        : await query('UPDATE admin_ai_settings SET config = ?, encrypted_key = ?, version = version + 1 WHERE id = 1 AND version = ? RETURNING id', [config, encryptedKey, version])
      if (!rows.length)
        throw new AdminError(409, 'AI 设置已在其他窗口修改，请刷新后重试')
    },
    async cached(inputHash: string, configHash: string) {
      const [row] = await query('SELECT text, input_hash AS inputHash, config_hash AS configHash FROM admin_ai_cache WHERE input_hash = ? AND config_hash = ?', [inputHash, configHash])
      return row ? summaryRecordSchema.parse(row) : null
    },
    async cacheForConfig(configHash: string) {
      return (await query('SELECT text, input_hash AS inputHash, config_hash AS configHash FROM admin_ai_cache WHERE config_hash = ?', [configHash])).map(row => summaryRecordSchema.parse(row))
    },
    async cache(record: SummaryRecord) {
      const value = summaryRecordSchema.parse(record)
      await query('INSERT INTO admin_ai_cache (input_hash,config_hash,text,created_at) VALUES (?,?,?,?) ON CONFLICT(input_hash,config_hash) DO NOTHING', [value.inputHash, value.configHash, value.text, new Date().toISOString()])
    },
  }
}
