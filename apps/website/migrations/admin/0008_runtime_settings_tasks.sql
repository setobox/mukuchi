CREATE TABLE IF NOT EXISTS site_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  stats_enabled INTEGER NOT NULL DEFAULT 1 CHECK (stats_enabled IN (0, 1)),
  version INTEGER NOT NULL DEFAULT 1
);
INSERT INTO site_settings(id) VALUES (1) ON CONFLICT DO NOTHING;

-- Operational metadata only: never store prompts, responses or credentials.
CREATE TABLE IF NOT EXISTS assistant_tasks (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('conversation', 'test')),
  config_version INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'waiting', 'completed', 'failed', 'cancelled')),
  stage TEXT NOT NULL DEFAULT 'task' CHECK (stage IN ('task', 'review', 'reply', 'done')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  finished_at INTEGER,
  deadline INTEGER NOT NULL,
  error TEXT,
  model_calls INTEGER NOT NULL DEFAULT 0,
  tool_calls INTEGER NOT NULL DEFAULT 0,
  history_calls INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS assistant_tasks_created ON assistant_tasks(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS assistant_tasks_status ON assistant_tasks(status, deadline);
CREATE TABLE IF NOT EXISTS assistant_task_steps (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES assistant_tasks(id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (stage IN ('task', 'review', 'reply')),
  label TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  error TEXT
);
CREATE INDEX IF NOT EXISTS assistant_steps_task ON assistant_task_steps(task_id, started_at);
