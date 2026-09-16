import type { SqlValue, StatsDatabase, StatsDatabaseOptions } from '../database'

interface D1Statement { bind: (...values: SqlValue[]) => D1Statement }
interface D1Binding {
  prepare: (sql: string) => D1Statement
  batch: (statements: D1Statement[]) => Promise<{ success: boolean, results: Record<string, unknown>[] }[]>
}
function isD1(value: unknown): value is D1Binding {
  return !!value && typeof value === 'object' && 'prepare' in value && typeof value.prepare === 'function'
    && 'batch' in value && typeof value.batch === 'function'
}
export function openStatsDatabase(options: StatsDatabaseOptions): StatsDatabase {
  const binding = options.binding
  if (!isD1(binding))
    throw new Error('缺少 STATS_DB 绑定')
  return {
    async batch(statements) {
      const results = await binding.batch(statements.map(statement => binding.prepare(statement.sql).bind(...(statement.params ?? []))))
      if (results.some(result => !result.success))
        throw new Error('统计数据库操作失败')
      return results.map(result => result.results)
    },
    close: () => {},
  }
}
