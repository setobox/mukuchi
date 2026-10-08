import type { AuthProfile } from '../../../shared/auth/model'
import type { AdminDatabase, SqlValue } from '../admin/database'
import { z } from 'zod'
import { AuthError, providerSchema, userSchema } from '../../../shared/auth/model'

export const transactionSchema = z.object({ browser_hash: z.string(), verifier: z.string(), nonce: z.string(), issuer: z.string(), client_id: z.string(), redirect_uri: z.string(), user_id: z.string().nullable(), session_hash: z.string().nullable(), return_to: z.string(), expires_at: z.number() })
export type LoginTransaction = z.infer<typeof transactionSchema>
const sessionSchema = z.object({ user_id: z.string().nullable(), local: z.number(), login_provider: providerSchema.nullable(), oidc_issuer: z.string().nullable(), encrypted_id_token: z.string().nullable(), csrf: z.string(), expires_at: z.number() })

export function createAuthRepository(db: AdminDatabase) {
  const query = async (sql: string, params: SqlValue[] = []) => (await db.batch([{ sql, params }]))[0]!
  const getUser = async (id: string) => {
    const row = (await query('SELECT id,email,name,avatar,disabled FROM auth_users WHERE id = ?', [id]))[0]
    return row ? userSchema.parse(row) : null
  }
  return {
    query,
    user: getUser,
    async linked(id: string, issuer: string) { return !!(await query('SELECT subject FROM auth_oidc_identities WHERE user_id = ? AND issuer = ?', [id, issuer]))[0] },
    async resolve(profile: AuthProfile, link?: { userId: string, sessionHash: string }) {
      if (!profile.trustedEmail)
        throw new AuthError(403, '请先验证邮箱', 'email')
      const id = crypto.randomUUID()
      const now = Date.now()
      // Each batch is one SQLite/D1 transaction. Never select a new identity by email.
      const results = await db.batch([
        link
          ? { sql: 'INSERT INTO auth_oidc_identities (issuer,subject,user_id) SELECT ?,?,u.id FROM auth_users u JOIN auth_sessions s ON s.user_id = u.id WHERE u.id = ? AND u.email = ? AND u.disabled = 0 AND s.token_hash = ? AND s.expires_at > ? ON CONFLICT DO NOTHING', params: [profile.issuer, profile.subject, link.userId, profile.email, link.sessionHash, now] }
          : { sql: 'INSERT INTO auth_users (id,email,name,avatar,created_at,updated_at) SELECT ?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM auth_oidc_identities WHERE issuer = ? AND subject = ?) ON CONFLICT DO NOTHING', params: [id, profile.email, profile.name, profile.avatar, now, now, profile.issuer, profile.subject] },
        { sql: 'INSERT INTO auth_oidc_identities (issuer,subject,user_id) SELECT ?,?,id FROM auth_users WHERE id = ? ON CONFLICT DO NOTHING', params: [profile.issuer, profile.subject, id] },
        { sql: 'DELETE FROM auth_users WHERE id = ? AND NOT EXISTS (SELECT 1 FROM auth_oidc_identities WHERE user_id = ?)', params: [id, id] },
        { sql: 'UPDATE auth_users SET name = ?,avatar = ?,updated_at = ? WHERE disabled = 0 AND id = (SELECT user_id FROM auth_oidc_identities WHERE issuer = ? AND subject = ?) AND (? IS NULL OR (id = ? AND email = ? AND EXISTS (SELECT 1 FROM auth_sessions WHERE token_hash = ? AND user_id = auth_users.id AND expires_at > ?))) RETURNING id,email,name,avatar,disabled', params: [profile.name, profile.avatar, now, profile.issuer, profile.subject, link?.userId ?? null, link?.userId ?? null, profile.email, link?.sessionHash ?? null, now] },
        { sql: 'SELECT u.disabled FROM auth_users u JOIN auth_oidc_identities i ON i.user_id = u.id WHERE i.issuer = ? AND i.subject = ?', params: [profile.issuer, profile.subject] },
      ])
      const row = results[3]![0]
      if (results[4]![0]?.disabled === 1)
        throw new AuthError(403, '本站账号已停用', 'disabled')
      if (!row)
        throw new AuthError(409, '账号已停用、邮箱冲突或身份绑定无效', link ? 'conflict' : 'link')
      return userSchema.parse(row)
    },
    async saveSession(tokenHash: string, userId: string | null, csrf: string, expires: number, issuer: string | null = null, encryptedIdToken: string | null = null, oldHash: string | null = null) {
      await db.batch([
        { sql: 'DELETE FROM auth_sessions WHERE expires_at <= ? OR token_hash = ?', params: [Date.now(), oldHash] },
        { sql: 'INSERT INTO auth_sessions (token_hash,user_id,local,csrf,expires_at,oidc_issuer,encrypted_id_token) VALUES (?,?,?,?,?,?,?)', params: [tokenHash, userId, userId === null ? 1 : 0, csrf, expires, issuer, encryptedIdToken] },
      ])
    },
    async session(tokenHash: string) {
      const row = (await query('SELECT user_id,local,csrf,expires_at,login_provider,oidc_issuer,encrypted_id_token FROM auth_sessions WHERE token_hash = ? AND expires_at > ?', [tokenHash, Date.now()]))[0]
      return row ? sessionSchema.parse(row) : null
    },
    async removeSession(hash: string) { await query('DELETE FROM auth_sessions WHERE token_hash = ?', [hash]) },
    async saveTransaction(hash: string, state: LoginTransaction) {
      await db.batch([
        { sql: 'DELETE FROM auth_login_transactions WHERE expires_at <= ?', params: [Date.now()] },
        { sql: 'INSERT INTO auth_login_transactions (state_hash,browser_hash,verifier,nonce,issuer,client_id,redirect_uri,user_id,session_hash,return_to,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)', params: [hash, state.browser_hash, state.verifier, state.nonce, state.issuer, state.client_id, state.redirect_uri, state.user_id, state.session_hash, state.return_to, state.expires_at] },
      ])
    },
    async consumeTransaction(hash: string, browserHash: string) {
      const row = (await query('DELETE FROM auth_login_transactions WHERE state_hash = ? AND browser_hash = ? AND expires_at > ? RETURNING *', [hash, browserHash, Date.now()]))[0]
      return row ? transactionSchema.parse(row) : null
    },
  }
}
