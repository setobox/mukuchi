CREATE TABLE admin_ai_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1), config TEXT NOT NULL,
  encrypted_key TEXT NOT NULL, version INTEGER NOT NULL
);
CREATE TABLE admin_ai_cache (
  input_hash TEXT NOT NULL, config_hash TEXT NOT NULL, text TEXT NOT NULL,
  created_at TEXT NOT NULL, PRIMARY KEY (input_hash, config_hash)
);
