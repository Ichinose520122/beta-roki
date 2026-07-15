CREATE INDEX IF NOT EXISTS photo_comments_friend_created_idx
  ON photo_comments(friend_id, created_at DESC);

CREATE INDEX IF NOT EXISTS friend_sessions_expires_idx
  ON friend_sessions(expires_at);

INSERT INTO gallery_settings (key, value, updated_at)
VALUES (
  'runtime_schema_version',
  '2026-07-performance-v1',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
)
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at;
