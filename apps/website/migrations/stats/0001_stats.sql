CREATE TABLE stats_totals (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  page_views INTEGER NOT NULL DEFAULT 0,
  visitors INTEGER NOT NULL DEFAULT 0,
  started_at INTEGER
);
INSERT INTO stats_totals (id) VALUES (1);
CREATE TABLE stats_visitors (visitor_hash TEXT PRIMARY KEY) WITHOUT ROWID;
CREATE TABLE stats_days (day TEXT PRIMARY KEY, page_views INTEGER NOT NULL) WITHOUT ROWID;
CREATE TABLE stats_pages (path TEXT PRIMARY KEY, page_views INTEGER NOT NULL) WITHOUT ROWID;
CREATE TABLE stats_page_days (
  day TEXT NOT NULL, path TEXT NOT NULL, page_views INTEGER NOT NULL,
  PRIMARY KEY (day, path)
) WITHOUT ROWID;
CREATE TABLE stats_visitor_days (
  day TEXT NOT NULL, visitor_hash TEXT NOT NULL,
  PRIMARY KEY (day, visitor_hash)
) WITHOUT ROWID;
CREATE TABLE stats_page_visitor_days (
  day TEXT NOT NULL, path TEXT NOT NULL, visitor_hash TEXT NOT NULL,
  PRIMARY KEY (day, path, visitor_hash)
) WITHOUT ROWID;
CREATE TABLE stats_events (
  event_id TEXT PRIMARY KEY, path TEXT NOT NULL, visitor_hash TEXT,
  occurred_at INTEGER NOT NULL, day TEXT NOT NULL
) WITHOUT ROWID;
CREATE INDEX stats_events_expiry ON stats_events (occurred_at);

-- A receipt and all of its aggregates share one SQL transaction, including on D1.
-- INSERT ... ON CONFLICT DO NOTHING does not fire this trigger on retries.
CREATE TRIGGER stats_record AFTER INSERT ON stats_events BEGIN
  UPDATE stats_totals SET
    page_views = page_views + 1,
    visitors = visitors + CASE WHEN NEW.visitor_hash IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM stats_visitors WHERE visitor_hash = NEW.visitor_hash) THEN 1 ELSE 0 END,
    started_at = COALESCE(started_at, NEW.occurred_at)
  WHERE id = 1;
  INSERT INTO stats_visitors SELECT NEW.visitor_hash WHERE NEW.visitor_hash IS NOT NULL
    ON CONFLICT DO NOTHING;
  INSERT INTO stats_days VALUES (NEW.day, 1)
    ON CONFLICT (day) DO UPDATE SET page_views = page_views + 1;
  INSERT INTO stats_pages VALUES (NEW.path, 1)
    ON CONFLICT (path) DO UPDATE SET page_views = page_views + 1;
  INSERT INTO stats_page_days VALUES (NEW.day, NEW.path, 1)
    ON CONFLICT (day, path) DO UPDATE SET page_views = page_views + 1;
  INSERT INTO stats_visitor_days SELECT NEW.day, NEW.visitor_hash WHERE NEW.visitor_hash IS NOT NULL
    ON CONFLICT DO NOTHING;
  INSERT INTO stats_page_visitor_days SELECT NEW.day, NEW.path, NEW.visitor_hash WHERE NEW.visitor_hash IS NOT NULL
    ON CONFLICT DO NOTHING;
END;
