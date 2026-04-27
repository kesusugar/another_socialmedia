CREATE TABLE IF NOT EXISTS users (
  user_id    TEXT PRIMARY KEY,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id          TEXT,
  category         TEXT,
  alpha            REAL DEFAULT 1.0,
  beta             REAL DEFAULT 1.0,
  confidence_score REAL DEFAULT 0.0,
  updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, category),
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS ads (
  ad_id        TEXT PRIMARY KEY,
  category     TEXT NOT NULL,
  title        TEXT,
  thumbnail    TEXT,
  vector_json  TEXT,
  virtual_bid  REAL DEFAULT 1.0,
  cold_start   INTEGER DEFAULT 0,
  daily_budget REAL DEFAULT 1000.0,
  spent_today  REAL DEFAULT 0.0,
  bid_strategy TEXT DEFAULT 'manual',
  target_cpa   REAL DEFAULT 500.0,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT,
  ad_id        TEXT,
  event_type   TEXT,
  dwell_ms     INTEGER,
  completion   REAL,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_events_user     ON events(user_id);
CREATE INDEX IF NOT EXISTS idx_events_time     ON events(created_at);
CREATE INDEX IF NOT EXISTS idx_events_ad       ON events(ad_id);
CREATE INDEX IF NOT EXISTS idx_ads_category    ON ads(category);
