import type { H3Event } from 'h3'
import { AdminError } from '../../../shared/admin/model'
import { statsSettingsSchema } from '../../../shared/stats/settings'
import { readAdminJson, withAdmin } from '../admin/http'
import { requireOwner } from '../auth/session'

export async function statsSettings(event: H3Event) {
  return withAdmin(event, async (repository) => {
    const [row] = await repository.query('SELECT stats_enabled,version FROM site_settings WHERE id = 1')
    return statsSettingsSchema.parse({ enabled: row?.stats_enabled === 1, version: row?.version })
  })
}
export async function statsSettingsRoute(event: H3Event) {
  await requireOwner(event)
  if (event.method === 'PUT') {
    const input = statsSettingsSchema.parse(await readAdminJson(event))
    if (input.enabled && String(useRuntimeConfig(event).statsHashSecret || '').length < 32)
      throw new AdminError(422, '统计标识密钥尚未配置，无法开启采集')
    await withAdmin(event, async (repository) => {
      const rows = await repository.query('UPDATE site_settings SET stats_enabled = ?,version = version + 1 WHERE id = 1 AND version = ? RETURNING id', [Number(input.enabled), input.version])
      if (!rows.length)
        throw new AdminError(409, '统计设置已变化，请刷新后重试')
    })
  }
  return statsSettings(event)
}
