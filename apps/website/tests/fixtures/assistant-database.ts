import type { AdminDatabase } from '../../server/features/admin/database'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { createAssistantRepository } from '../../server/features/assistant/repository'

export function assistantDatabase() {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  for (const name of ['0006_assistant.sql', '0007_assistant_budget.sql', '0008_runtime_settings_tasks.sql'])
    db.exec(readFileSync(new URL(`../../migrations/admin/${name}`, import.meta.url), 'utf8'))
  const connection: AdminDatabase = { close() {
    db.close()
  }, async batch(statements) {
    db.exec('BEGIN IMMEDIATE')
    try {
      const result = statements.map(item => db.prepare(item.sql).all(...(item.params ?? [])) as Record<string, unknown>[])
      db.exec('COMMIT')
      return result
    }
    catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  } }
  return { db, connection, repository: createAssistantRepository(connection) }
}
