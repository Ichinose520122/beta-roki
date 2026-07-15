CREATE TABLE IF NOT EXISTS gallery_friends (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  student_id_hmac TEXT NOT NULL UNIQUE,
  is_active INTEGER NOT NULL DEFAULT 1,
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS gallery_friends_name_idx
  ON gallery_friends(normalized_name, is_active);

CREATE TABLE IF NOT EXISTS friend_sessions (
  token_hash TEXT PRIMARY KEY,
  friend_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (friend_id) REFERENCES gallery_friends(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS friend_sessions_friend_idx
  ON friend_sessions(friend_id, expires_at);

CREATE TABLE IF NOT EXISTS photo_comments (
  id TEXT PRIMARY KEY,
  image_id TEXT NOT NULL,
  friend_id TEXT,
  author_name TEXT NOT NULL,
  content TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (image_id) REFERENCES gallery_items(id) ON DELETE CASCADE,
  FOREIGN KEY (friend_id) REFERENCES gallery_friends(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS photo_comments_image_idx
  ON photo_comments(image_id, created_at DESC);

CREATE INDEX IF NOT EXISTS photo_comments_unread_idx
  ON photo_comments(is_read, created_at DESC);

CREATE TABLE IF NOT EXISTS friend_login_attempts (
  identity_hash TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  window_started_at TEXT NOT NULL,
  blocked_until TEXT,
  updated_at TEXT NOT NULL
);
