CREATE TABLE IF NOT EXISTS gallery_items (
  id TEXT PRIMARY KEY,
  object_key TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  comment TEXT NOT NULL DEFAULT '',
  shot_at TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  content_type TEXT NOT NULL DEFAULT 'image/webp',
  size INTEGER NOT NULL DEFAULT 0,
  is_pinned INTEGER NOT NULL DEFAULT 0,
  pinned_until TEXT,
  is_featured INTEGER NOT NULL DEFAULT 0,
  featured_until TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS gallery_items_category_idx
  ON gallery_items(category, shot_at DESC);

CREATE INDEX IF NOT EXISTS gallery_items_schedule_idx
  ON gallery_items(is_pinned, pinned_until, is_featured, featured_until);

CREATE TABLE IF NOT EXISTS gallery_snapshots (
  name TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

