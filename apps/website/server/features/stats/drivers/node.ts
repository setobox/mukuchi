import type { StatsDatabase, StatsDatabaseOptions } from '../database'
import { existsSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

export function openStatsDatabase(options: StatsDatabaseOptions): StatsDatabase {
  // Migrations are explicit; a missing database must never silently become empty data.
  if (!existsSync(options.filename))
    throw new Error('统计数据库不存在，请先执行迁移')
  const db = new DatabaseSync(options.filename, { open: true })
  db.exec('PRAGMA busy_timeout = 5000')
  return {
    async batch(statements) {
      db.exec('BEGIN IMMEDIATE')
      try {
        const results = statements.map(statement => db.prepare(statement.sql).all(...(statement.params ?? [])))
        db.exec('COMMIT')
        return results
      }
      catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    },
    close: () => db.close(),
  }
}
