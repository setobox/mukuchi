import type { AuthProfile } from '../../../shared/auth/model'
import type { AdminDatabase, SqlValue } from '../admin/database'
import { z } from 'zod'
import { AuthError, profileSchema, providerSchema, userSchema } from '../../../shared/auth/model'

export const oauthSchema = z.object({ provider: providerSchema, verifier: z.string(), nonce: z.string(), user_id: z.string().nullable(), session_hash: z.string().nullable(), return_to: z.string(), expires_at: z.number() })
export type OAuthState = z.infer<typeof oauthSchema>
const verificationSchema = z.object({ token_hash: z.string(), user_id: z.uuid(), email: z.string(), profile: z.string().transform(value => profileSchema.parse(JSON.parse(value))), csrf: z.string(), return_to: z.string(), expires_at: z.number(), code_hash: z.string().nullable(), code_expires_at: z.number(), attempts: z.number(), send_after: z.number(), consumed_at: z.number().nullable() })
export type Verification = z.infer<typeof verificationSchema>
const sessionSchema = z.object({ user_id: z.string().nullable(), local: z.number(), csrf: z.string(), expires_at: z.number() })

export function createAuthRepository(db: AdminDatabase) {
  const query = async (sql: string, params: SqlValue[] = []) => (await db.batch([{ sql, params }]))[0]!
  const getUser = async (id: string) => {
    const row = (await query('SELECT id,email,name,avatar FROM auth_users WHERE id = ?', [id]))[0]
    return row ? userSchema.parse(row) : null
  }
  return {
    query,
    user: getUser,
    async identity(provider: string, subject: string) {
      const row = (await query('SELECT u.id,u.email,u.name,u.avatar FROM auth_users u JOIN auth_identities i ON i.user_id = u.id WHERE i.provider = ? AND i.subject = ?', [provider, subject]))[0]
      return row ? userSchema.parse(row) : null
    },
    async emailExists(email: string) { return !!(await query('SELECT id FROM auth_users WHERE email = ?', [email]))[0] },
    async providers(id: string) { return (await query('SELECT provider FROM auth_identities WHERE user_id = ? ORDER BY provider', [id])).map(row => providerSchema.parse(row.provider)) },
    async syncProfile(id: string, profile: AuthProfile) {
      await query('UPDATE auth_users SET name = ?, avatar = ?, updated_at = ? WHERE id = ?', [profile.name, profile.avatar, Date.now(), id])
      return (await getUser(id))!
    },
    async resolve(profile: AuthProfile) {
      if (!profile.trustedEmail)
        throw new AuthError(403, '请先验证邮箱')
      const id = crypto.randomUUID()
      const now = Date.now()
      const results = await db.batch([
        { sql: 'INSERT INTO auth_users (id,email,name,avatar,created_at,updated_at) SELECT ?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM auth_identities WHERE provider = ? AND subject = ?) ON CONFLICT DO NOTHING', params: [id, profile.email, profile.name, profile.avatar, now, now, profile.provider, profile.subject] },
        { sql: 'INSERT INTO auth_identities (provider,subject,user_id) SELECT ?,?,id FROM auth_users WHERE email = ? ON CONFLICT DO NOTHING', params: [profile.provider, profile.subject, profile.email] },
        { sql: 'DELETE FROM auth_users WHERE id = ? AND NOT EXISTS (SELECT 1 FROM auth_identities WHERE user_id = ?)', params: [id, id] },
        { sql: 'UPDATE auth_users SET name = ?,avatar = ?,updated_at = ? WHERE id = (SELECT user_id FROM auth_identities WHERE provider = ? AND subject = ?) RETURNING id,email,name,avatar', params: [profile.name, profile.avatar, now, profile.provider, profile.subject] },
      ])
      const row = results[3]![0]
      if (!row)
        throw new AuthError(409, '此账号已关联该平台的其他身份', 'conflict')
      return userSchema.parse(row)
    },
    async link(id: string, profile: AuthProfile) {
      const results = await db.batch([
        { sql: 'INSERT INTO auth_identities (provider,subject,user_id) SELECT ?,?,id FROM auth_users WHERE id = ? AND email = ? ON CONFLICT DO NOTHING', params: [profile.provider, profile.subject, id, profile.email] },
        { sql: 'SELECT user_id FROM auth_identities WHERE provider = ? AND subject = ?', params: [profile.provider, profile.subject] },
      ])
      if (results[1]![0]?.user_id !== id)
        throw new AuthError(409, '此登录方式已关联其他账号', 'conflict')
    },
    async saveSession(tokenHash: string, userId: string | null, csrf: string, expires: number) {
      await db.batch([
        { sql: 'DELETE FROM auth_sessions WHERE expires_at <= ?', params: [Date.now()] },
        { sql: 'INSERT INTO auth_sessions (token_hash,user_id,local,csrf,expires_at) VALUES (?,?,?,?,?)', params: [tokenHash, userId, userId === null ? 1 : 0, csrf, expires] },
      ])
    },
    async session(tokenHash: string) {
      const row = (await query('SELECT user_id,local,csrf,expires_at FROM auth_sessions WHERE token_hash = ? AND expires_at > ?', [tokenHash, Date.now()]))[0]
      return row ? sessionSchema.parse(row) : null
    },
    async removeSession(hash: string) { await query('DELETE FROM auth_sessions WHERE token_hash = ?', [hash]) },
    async saveOAuth(hash: string, state: OAuthState) {
      await db.batch([
        { sql: 'DELETE FROM auth_oauth WHERE expires_at <= ?', params: [Date.now()] },
        { sql: 'INSERT INTO auth_oauth (state_hash,provider,verifier,nonce,user_id,session_hash,return_to,expires_at) VALUES (?,?,?,?,?,?,?,?)', params: [hash, state.provider, state.verifier, state.nonce, state.user_id, state.session_hash, state.return_to, state.expires_at] },
      ])
    },
    async consumeOAuth(hash: string, provider: string) {
      const row = (await query('DELETE FROM auth_oauth WHERE state_hash = ? AND provider = ? AND expires_at > ? RETURNING *', [hash, provider, Date.now()]))[0]
      return row ? oauthSchema.parse(row) : null
    },
    async createVerification(hash: string, profile: AuthProfile, csrf: string, returnTo: string) {
      await db.batch([
        { sql: 'DELETE FROM auth_verifications WHERE expires_at <= ? OR consumed_at IS NOT NULL', params: [Date.now()] },
        { sql: 'INSERT INTO auth_verifications (token_hash,user_id,email,profile,csrf,return_to,expires_at) VALUES (?,?,?,?,?,?,?)', params: [hash, crypto.randomUUID(), profile.email, JSON.stringify(profile), csrf, returnTo, Date.now() + 30 * 60_000] },
      ])
    },
    async verification(hash: string) {
      const row = (await query('SELECT * FROM auth_verifications WHERE token_hash = ? AND expires_at > ? AND consumed_at IS NULL', [hash, Date.now()]))[0]
      return row ? verificationSchema.parse(row) : null
    },
    async reserveMail(hash: string, emailHash: string, ipHash: string, codeHash: string) {
      const now = Date.now()
      const id = crypto.randomUUID()
      const results = await db.batch([
        { sql: 'DELETE FROM auth_mail_events WHERE created_at <= ?', params: [now - 3600_000] },
        { sql: 'INSERT INTO auth_mail_events (id,email_hash,ip_hash,created_at) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM auth_verifications WHERE token_hash = ? AND expires_at > ? AND consumed_at IS NULL AND send_after <= ?) AND (SELECT COUNT(*) FROM auth_mail_events WHERE email_hash = ?) < 5 AND (SELECT COUNT(*) FROM auth_mail_events WHERE ip_hash = ?) < 20', params: [id, emailHash, ipHash, now, hash, now, now, emailHash, ipHash] },
        { sql: 'UPDATE auth_verifications SET code_hash = ?,code_expires_at = ?,attempts = 0,send_after = ? WHERE token_hash = ? AND EXISTS (SELECT 1 FROM auth_mail_events WHERE id = ?) RETURNING token_hash', params: [codeHash, now + 600_000, now + 60_000, hash, id] },
      ])
      return !!results[2]![0]
    },
    async mailFailed(hash: string, codeHash: string) {
      await query('UPDATE auth_verifications SET code_hash = NULL,send_after = 0 WHERE token_hash = ? AND code_hash = ?', [hash, codeHash])
    },
    async completeVerification(verification: Verification, codeHash: string) {
      const now = Date.now()
      const hash = verification.token_hash
      // One transaction / D1 batch: only the winner can consume the challenge.
      const valid = 'token_hash = ? AND consumed_at IS NULL AND expires_at > ? AND code_expires_at > ? AND attempts < 5 AND code_hash = ?'
      const guard = [hash, now, now, codeHash]
      const p = verification.profile
      const results = await db.batch([
        { sql: 'UPDATE auth_verifications SET attempts = attempts + 1 WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > ? AND code_expires_at > ? AND attempts < 5 AND code_hash <> ?', params: guard },
        { sql: `INSERT INTO auth_users (id,email,name,avatar,created_at,updated_at) SELECT user_id,email,?,?,?,? FROM auth_verifications WHERE ${valid} AND NOT EXISTS (SELECT 1 FROM auth_identities WHERE provider = ? AND subject = ?) ON CONFLICT DO NOTHING`, params: [p.name, p.avatar, now, now, ...guard, p.provider, p.subject] },
        { sql: `INSERT INTO auth_identities (provider,subject,user_id) SELECT ?,?,user_id FROM auth_verifications WHERE ${valid} AND EXISTS (SELECT 1 FROM auth_users WHERE id = auth_verifications.user_id) ON CONFLICT DO NOTHING`, params: [p.provider, p.subject, ...guard] },
        { sql: `UPDATE auth_verifications SET consumed_at = ? WHERE ${valid} AND EXISTS (SELECT 1 FROM auth_identities WHERE provider = ? AND subject = ? AND user_id = auth_verifications.user_id) RETURNING user_id`, params: [now, ...guard, p.provider, p.subject] },
        { sql: 'DELETE FROM auth_users WHERE id = ? AND NOT EXISTS (SELECT 1 FROM auth_identities WHERE user_id = ?)', params: [verification.user_id, verification.user_id] },
      ])
      return results[3]![0] ? getUser(verification.user_id) : null
    },
  }
}
