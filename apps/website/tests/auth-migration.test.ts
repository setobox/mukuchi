import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { expect, test } from 'vite-plus/test'

test('OIDC 迁移保留原用户、身份和会话，限缩有效期且清理旧待登录事务', () => {
  const db = new DatabaseSync(':memory:')
  const migrate = (name: string) => db.exec(readFileSync(new URL(`../migrations/admin/${name}`, import.meta.url), 'utf8'))
  try {
    migrate('0004_auth.sql')
    migrate('0005_session_login_provider.sql')
    db.exec('PRAGMA foreign_keys = ON')
    const user = crypto.randomUUID()
    db.prepare('INSERT INTO auth_users VALUES (?,?,?,?,?,?)').run(user, 'user@example.com', 'User', '', Date.now(), Date.now())
    db.prepare('INSERT INTO auth_identities VALUES (?,?,?)').run('github', 'old-subject', user)
    db.prepare('INSERT INTO auth_sessions VALUES (?,?,?,?,?,?)').run('session-hash', user, 0, 'csrf', Date.now() + 604800000, 'github')
    db.prepare('INSERT INTO auth_oauth VALUES (?,?,?,?,?,?,?,?)').run('state', 'github', 'verifier', 'nonce', null, null, '/posts', Date.now() + 600000)
    migrate('0009_oidc.sql')
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    expect(db.prepare('SELECT * FROM auth_users').get()).toMatchObject({ id: user, disabled: 0, email: 'user@example.com' })
    expect(db.prepare('SELECT * FROM auth_identities').get()).toMatchObject({ user_id: user, subject: 'old-subject' })
    const session = db.prepare('SELECT * FROM auth_sessions').get()!
    expect(session).toMatchObject({ token_hash: 'session-hash', user_id: user, csrf: 'csrf', login_provider: 'github', oidc_issuer: null, encrypted_id_token: null })
    expect(Number(session.expires_at)).toBeLessThanOrEqual(Date.now() + 28800000)
    expect(db.prepare('SELECT * FROM auth_oauth').all()).toEqual([])
    expect(db.prepare('SELECT * FROM auth_oidc_identities').all()).toEqual([])
  }
  finally { db.close() }
})
