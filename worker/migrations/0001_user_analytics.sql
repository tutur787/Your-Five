CREATE TABLE IF NOT EXISTS user_directory (
  account_id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE,
  display_name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_login_at INTEGER NOT NULL,
  last_active_at INTEGER NOT NULL,
  games_completed INTEGER NOT NULL DEFAULT 0,
  basketball_games INTEGER NOT NULL DEFAULT 0,
  football_games INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS user_directory_created_at_idx
  ON user_directory(created_at DESC);

CREATE INDEX IF NOT EXISTS user_directory_last_active_at_idx
  ON user_directory(last_active_at DESC);

CREATE TABLE IF NOT EXISTS completed_match_directory (
  account_id TEXT NOT NULL,
  match_id TEXT NOT NULL,
  completed_at INTEGER NOT NULL,
  sport TEXT NOT NULL CHECK (sport IN ('basketball', 'soccer')),
  competition TEXT NOT NULL,
  mode TEXT NOT NULL,
  PRIMARY KEY (account_id, match_id),
  FOREIGN KEY (account_id) REFERENCES user_directory(account_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS completed_match_pool_idx
  ON completed_match_directory(sport, competition);

CREATE INDEX IF NOT EXISTS completed_match_mode_idx
  ON completed_match_directory(mode);
