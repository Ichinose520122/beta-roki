import { CATEGORIES, findCategory } from "./categories.js";

const initialized = new WeakMap();

const TABLE_SQL = `CREATE TABLE IF NOT EXISTS gallery_items (
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
)`;

const CATEGORY_INDEX_SQL =
  "CREATE INDEX IF NOT EXISTS gallery_items_category_idx ON gallery_items(category, shot_at DESC)";
const SCHEDULE_INDEX_SQL =
  "CREATE INDEX IF NOT EXISTS gallery_items_schedule_idx ON gallery_items(is_pinned, pinned_until, is_featured, featured_until)";
const SNAPSHOT_TABLE_SQL = `CREATE TABLE IF NOT EXISTS gallery_snapshots (
  name TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`;

export async function ensureSchema(db) {
  if (!db) throw new Error("缺少 D1 绑定 DB");
  if (!initialized.has(db)) {
    initialized.set(
      db,
      db.batch([
        db.prepare(TABLE_SQL),
        db.prepare(CATEGORY_INDEX_SQL),
        db.prepare(SCHEDULE_INDEX_SQL),
        db.prepare(SNAPSHOT_TABLE_SQL),
      ]),
    );
  }
  await initialized.get(db);
}

export function safeTags(tagsJson) {
  try {
    const value = JSON.parse(tagsJson || "[]");
    return Array.isArray(value) ? value.map(String) : [];
  } catch {
    return [];
  }
}

export function scheduleIsActive(enabled, until, now = new Date()) {
  if (!enabled) return false;
  if (!until) return true;
  const current = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now);
  return String(until) > current;
}

export function publicItem(row, now = new Date()) {
  return {
    id: row.id,
    title: row.title || "",
    comment: row.comment || "",
    time: row.shot_at,
    tags: safeTags(row.tags_json),
    pinned: scheduleIsActive(row.is_pinned, row.pinned_until, now),
    featured: scheduleIsActive(row.is_featured, row.featured_until, now),
    url: `/gallery/${encodeURIComponent(row.id)}`,
  };
}

export function adminItem(row, now = new Date()) {
  const category = findCategory(row.category);
  return {
    ...publicItem(row, now),
    category: category?.source || row.category,
    categoryName: category?.name || row.category,
    pinnedEnabled: Boolean(row.is_pinned),
    pinnedUntil: row.pinned_until || null,
    featuredEnabled: Boolean(row.is_featured),
    featuredUntil: row.featured_until || null,
    contentType: row.content_type,
    size: Number(row.size || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listRows(db, includeObjectKey = false) {
  const fields = [
    "id",
    "category",
    "title",
    "comment",
    "shot_at",
    "tags_json",
    "content_type",
    "size",
    "is_pinned",
    "pinned_until",
    "is_featured",
    "featured_until",
    "created_at",
    "updated_at",
  ];
  if (includeObjectKey) fields.push("object_key");
  const result = await db
    .prepare(`SELECT ${fields.join(", ")} FROM gallery_items ORDER BY shot_at DESC, id DESC`)
    .all();
  return result.results || [];
}

export async function writePrivateGallerySnapshot(env) {
  const rows = await listRows(env.DB, true);
  const snapshot = {
    version: 2,
    updatedAt: new Date().toISOString(),
    images: rows.map((row) => ({
      id: row.id,
      objectKey: row.object_key,
      category: findCategory(row.category)?.source || row.category,
      title: row.title || "",
      comment: row.comment || "",
      time: row.shot_at,
      tags: safeTags(row.tags_json),
      contentType: row.content_type,
      size: Number(row.size || 0),
      pinned: { enabled: Boolean(row.is_pinned), until: row.pinned_until || null },
      featured: { enabled: Boolean(row.is_featured), until: row.featured_until || null },
    })),
  };

  await env.DB.prepare(
    `INSERT INTO gallery_snapshots (name, payload, updated_at)
     VALUES ('gallery.json', ?1, ?2)
     ON CONFLICT(name) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
  )
    .bind(JSON.stringify(snapshot, null, 2), snapshot.updatedAt)
    .run();
  return snapshot;
}

export function buildPublicGallery(rows) {
  const now = new Date();
  const grouped = new Map(CATEGORIES.map((category) => [category.source, []]));

  rows.forEach((row) => {
    const source = findCategory(row.category)?.source || row.category;
    if (!grouped.has(source)) grouped.set(source, []);
    grouped.get(source).push(publicItem(row, now));
  });

  const sortItems = (a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.featured !== b.featured) return a.featured ? -1 : 1;
    return Date.parse(b.time.replace(" ", "T")) - Date.parse(a.time.replace(" ", "T"));
  };

  return {
    version: 2,
    generatedAt: now.toISOString(),
    categories: CATEGORIES.map((category) => ({
      id: category.id,
      name: category.name,
      images: (grouped.get(category.source) || []).sort(sortItems),
    })),
  };
}
