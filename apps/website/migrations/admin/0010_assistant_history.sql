CREATE TABLE assistant_conversations (
  actor TEXT NOT NULL, id TEXT NOT NULL, title TEXT NOT NULL,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1, deleted INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (actor, id)
);
CREATE TABLE assistant_messages (
  actor TEXT NOT NULL, id TEXT NOT NULL, conversation_id TEXT NOT NULL,
  created_at INTEGER NOT NULL, user TEXT NOT NULL, page TEXT NOT NULL,
  status TEXT NOT NULL, record TEXT, error TEXT,
  PRIMARY KEY (actor, id)
);
CREATE INDEX assistant_messages_conversation ON assistant_messages(actor, conversation_id, created_at, id);
-- Claims survive deletion, so stale devices cannot import a guest conversation again.
CREATE TABLE assistant_history_imports (
  source_actor TEXT NOT NULL, conversation_id TEXT NOT NULL, owner_actor TEXT NOT NULL,
  PRIMARY KEY (source_actor, conversation_id)
);
