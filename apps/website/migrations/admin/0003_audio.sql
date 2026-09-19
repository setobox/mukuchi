CREATE TABLE audio_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1), config TEXT NOT NULL,
  encrypted_key TEXT NOT NULL, version INTEGER NOT NULL
);
CREATE TABLE audio_articles (
  path TEXT PRIMARY KEY, input_hash TEXT NOT NULL, revision TEXT NOT NULL,
  narration_enabled INTEGER NOT NULL DEFAULT 1, podcast_enabled INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE audio_jobs (
  id TEXT PRIMARY KEY, path TEXT NOT NULL, title TEXT NOT NULL, kind TEXT NOT NULL,
  input_hash TEXT NOT NULL, config_hash TEXT NOT NULL, config TEXT NOT NULL, input TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued', publication TEXT NOT NULL DEFAULT 'private',
  phase TEXT NOT NULL DEFAULT 'pending', attempt INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1, provider_id TEXT NOT NULL DEFAULT '',
  result_url TEXT NOT NULL DEFAULT '', object_key TEXT NOT NULL DEFAULT '', size INTEGER NOT NULL DEFAULT 0,
  progress TEXT NOT NULL DEFAULT '', message TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(path, input_hash, config_hash, kind)
);
CREATE INDEX audio_jobs_pending ON audio_jobs(status, created_at);
CREATE INDEX audio_jobs_article ON audio_jobs(path, input_hash, publication);
CREATE TABLE audio_usage (
  day TEXT PRIMARY KEY, narration_characters INTEGER NOT NULL DEFAULT 0,
  podcasts INTEGER NOT NULL DEFAULT 0
);
