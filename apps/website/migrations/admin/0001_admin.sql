CREATE TABLE admin_drafts (
  id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, source TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1, base_hash TEXT, published_version INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
CREATE TABLE admin_sessions (
  token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, login TEXT NOT NULL, avatar TEXT NOT NULL,
  local INTEGER NOT NULL DEFAULT 0, csrf TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE admin_oauth (
  state_hash TEXT PRIMARY KEY, verifier TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE admin_assets (
  id TEXT PRIMARY KEY, draft_id TEXT NOT NULL, path TEXT NOT NULL, mime TEXT NOT NULL,
  size INTEGER NOT NULL, hash TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX admin_assets_draft ON admin_assets(draft_id);
CREATE TABLE admin_publications (
  id TEXT PRIMARY KEY, draft_id TEXT NOT NULL, version INTEGER NOT NULL, action TEXT NOT NULL,
  status TEXT NOT NULL, commit_sha TEXT, message TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL,
  url TEXT, source TEXT NOT NULL, base_hash TEXT, result_hash TEXT, lease_token TEXT, lease_until INTEGER,
  UNIQUE (draft_id, version, action)
);
CREATE UNIQUE INDEX admin_publication_pending ON admin_publications(draft_id) WHERE status = 'preparing';
