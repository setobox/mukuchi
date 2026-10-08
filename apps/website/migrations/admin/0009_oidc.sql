-- Keep business user IDs and legacy sessions for explicit, authenticated linking.
ALTER TABLE auth_users ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0 CHECK(disabled IN (0,1));
CREATE TABLE auth_oidc_identities (
  issuer TEXT NOT NULL, subject TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES auth_users(id),
  PRIMARY KEY (issuer, subject), UNIQUE (user_id, issuer)
);
CREATE TABLE auth_login_transactions (
  state_hash TEXT PRIMARY KEY, browser_hash TEXT NOT NULL,
  verifier TEXT NOT NULL, nonce TEXT NOT NULL, issuer TEXT NOT NULL, client_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL, return_to TEXT NOT NULL, expires_at INTEGER NOT NULL,
  user_id TEXT, session_hash TEXT
);
CREATE INDEX auth_login_expiry ON auth_login_transactions(expires_at);
ALTER TABLE auth_sessions ADD COLUMN oidc_issuer TEXT;
ALTER TABLE auth_sessions ADD COLUMN encrypted_id_token TEXT;
-- Legacy login_provider has a github/google CHECK. New SSO sessions use oidc_issuer.
UPDATE auth_sessions SET expires_at = MIN(expires_at, CAST(strftime('%s','now') AS INTEGER) * 1000 + 28800000);
DELETE FROM auth_oauth;
DELETE FROM auth_verifications;
DELETE FROM auth_mail_events;
