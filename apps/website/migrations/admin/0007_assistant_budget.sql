ALTER TABLE assistant_daily_usage ADD COLUMN reset_micros INTEGER NOT NULL DEFAULT 0 CHECK (reset_micros >= 0 AND reset_micros <= spent_micros);

CREATE TABLE assistant_budget_resets (
  id TEXT PRIMARY KEY,
  day TEXT NOT NULL,
  actor TEXT NOT NULL,
  released_micros INTEGER NOT NULL CHECK (released_micros > 0),
  created_at INTEGER NOT NULL,
  FOREIGN KEY (day) REFERENCES assistant_daily_usage(day)
);
CREATE INDEX assistant_budget_resets_day ON assistant_budget_resets(day);
