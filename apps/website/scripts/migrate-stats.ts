import { mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

const filename = resolve(process.env.NUXT_STATS_DATABASE_PATH || '.data/stats.sqlite')
const directory = fileURLToPath(new URL('../migrations/stats/', import.meta.url))
mkdirSync(dirname(filename), { recursive: true })
const db = new DatabaseSync(filename)
try {
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000')
  db.exec('CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)')
  for (const name of readdirSync(directory).filter(name => name.endsWith('.sql')).sort()) {
    if (db.prepare('SELECT 1 FROM d1_migrations WHERE name = ?').get(name))
      continue
    db.exec('BEGIN IMMEDIATE')
    try {
      db.exec(readFileSync(resolve(directory, name), 'utf8'))
      db.prepare('INSERT INTO d1_migrations (name) VALUES (?)').run(name)
      db.exec('COMMIT')
      console.log(`已应用统计迁移：${name}`)
    }
    catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }
  console.log('统计 SQLite 迁移完成。')
}
finally {
  db.close()
}
