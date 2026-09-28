-- Existing admin tables remain intact for rollback. New code ignores legacy sessions.
CREATE TABLE auth_users (
  id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL, avatar TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE auth_identities (
  provider TEXT NOT NULL CHECK(provider IN ('github','google')), subject TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES auth_users(id),
  PRIMARY KEY(provider, subject), UNIQUE(user_id, provider)
);
CREATE TABLE auth_sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT REFERENCES auth_users(id),
  local INTEGER NOT NULL DEFAULT 0, csrf TEXT NOT NULL, expires_at INTEGER NOT NULL,
  CHECK ((local = 1 AND user_id IS NULL) OR (local = 0 AND user_id IS NOT NULL))
);
CREATE INDEX auth_sessions_expiry ON auth_sessions(expires_at);
CREATE TABLE auth_oauth (
  state_hash TEXT PRIMARY KEY, provider TEXT NOT NULL, verifier TEXT NOT NULL, nonce TEXT NOT NULL,
  user_id TEXT, session_hash TEXT, return_to TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE auth_verifications (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, email TEXT NOT NULL, profile TEXT NOT NULL,
  csrf TEXT NOT NULL, return_to TEXT NOT NULL, expires_at INTEGER NOT NULL,
  code_hash TEXT, code_expires_at INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0, send_after INTEGER NOT NULL DEFAULT 0, consumed_at INTEGER
);
CREATE TABLE auth_mail_events (
  id TEXT PRIMARY KEY, email_hash TEXT NOT NULL, ip_hash TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX auth_mail_email ON auth_mail_events(email_hash, created_at);
CREATE INDEX auth_mail_ip ON auth_mail_events(ip_hash, created_at);
