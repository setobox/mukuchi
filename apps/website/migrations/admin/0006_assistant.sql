-- Assistant storage contains settings and operational metadata only, never chat text.
CREATE TABLE IF NOT EXISTS assistant_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  config TEXT NOT NULL,
  encrypted_credentials TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  verified_hash TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS assistant_requests (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  day TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  lease_until INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active','waiting','completed','cancelled','failed')),
  model_calls INTEGER NOT NULL DEFAULT 0,
  tool_calls INTEGER NOT NULL DEFAULT 0,
  history_calls INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS assistant_requests_actor_time ON assistant_requests(actor, created_at);
CREATE INDEX IF NOT EXISTS assistant_requests_ip_time ON assistant_requests(ip_hash, created_at);
CREATE INDEX IF NOT EXISTS assistant_requests_lease ON assistant_requests(status, lease_until);
CREATE INDEX IF NOT EXISTS assistant_requests_day ON assistant_requests(day);

CREATE TABLE IF NOT EXISTS assistant_daily_usage (
  day TEXT PRIMARY KEY,
  reserved_micros INTEGER NOT NULL DEFAULT 0 CHECK (reserved_micros >= 0),
  spent_micros INTEGER NOT NULL DEFAULT 0 CHECK (spent_micros >= 0)
);
CREATE TABLE IF NOT EXISTS assistant_charges (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  day TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('model','moderation')),
  reserved_micros INTEGER NOT NULL CHECK (reserved_micros >= 0),
  spent_micros INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (request_id) REFERENCES assistant_requests(id),
  FOREIGN KEY (day) REFERENCES assistant_daily_usage(day)
);
CREATE INDEX IF NOT EXISTS assistant_charges_request ON assistant_charges(request_id);

CREATE TABLE IF NOT EXISTS assistant_continuations (
  nonce TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  actor TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed INTEGER NOT NULL DEFAULT 0 CHECK (consumed IN (0,1)),
  FOREIGN KEY (request_id) REFERENCES assistant_requests(id)
);

CREATE TABLE IF NOT EXISTS assistant_actions (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  article_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','authorized','claimed','succeeded','failed','cancelled'))
);
CREATE INDEX IF NOT EXISTS assistant_actions_actor ON assistant_actions(actor, conversation_id);
