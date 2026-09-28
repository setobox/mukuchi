import type { AdminDatabase } from '../../server/features/admin/database'
import type { AuthProfile } from '../../shared/auth/model'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { createAuthRepository } from '../../server/features/auth/repository'

export const githubProfile: AuthProfile = { provider: 'github', subject: '123', email: 'owner@example.com', name: 'Owner', avatar: 'https://avatars.githubusercontent.com/u/123', trustedEmail: true }
export function authDatabase() {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec('PRAGMA foreign_keys = ON')
  sqlite.exec(readFileSync(new URL('../../migrations/admin/0004_auth.sql', import.meta.url), 'utf8'))
  const db: AdminDatabase = { close: () => sqlite.close(), async batch(statements) {
    sqlite.exec('BEGIN IMMEDIATE')
    try {
      const result = statements.map(statement => sqlite.prepare(statement.sql).all(...(statement.params ?? [])) as Record<string, unknown>[])
      sqlite.exec('COMMIT')
      return result
    }
    catch (cause) {
      sqlite.exec('ROLLBACK')
      throw cause
    }
  } }
  return { sqlite, db, repo: createAuthRepository(db) }
}
