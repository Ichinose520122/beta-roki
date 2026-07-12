import {
  DEFAULT_CATEGORIES,
  findCategoryInList,
  listCategories,
} from "./categories.js";

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

const CATEGORIES_TABLE_SQL = `CREATE TABLE IF NOT EXISTS gallery_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  aliases_json TEXT NOT NULL DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_visible INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`;

const CATEGORY_INDEX_SQL =
  "CREATE INDEX IF NOT EXISTS gallery_items_category_idx ON gallery_items(category, shot_at DESC)";
const CATEGORY_ORDER_INDEX_SQL =
  "CREATE INDEX IF NOT EXISTS gallery_categories_order_idx ON gallery_categories(sort_order, created_at)";
const SCHEDULE_INDEX_SQL =
  "CREATE INDEX IF NOT EXISTS gallery_items_schedule_idx ON gallery_items(is_pinned, pinned_until, is_featured, featured_until)";
const SNAPSHOT_TABLE_SQL = `CREATE TABLE IF NOT EXISTS gallery_snapshots (
  name TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`;

async function initializeSchema(db) {
  await db.batch([
    db.prepare(TABLE_SQL),
    db.prepare(CATEGORIES_TABLE_SQL),
    db.prepare(CATEGORY_INDEX_SQL),
    db.prepare(CATEGORY_ORDER_INDEX_SQL),
    db.prepare(SCHEDULE_INDEX_SQL),
    db.prepare(SNAPSHOT_TABLE_SQL),
  ]);

  const now = new Date().toISOString();
  await db.batch(DEFAULT_CATEGORIES.map((category, index) => db.prepare(
    `INSERT OR IGNORE INTO gallery_categories
      (id, name, aliases_json, sort_order, is_visible, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, 1, ?5, ?6)`,
  ).bind(
    category.id,
    category.name,
    JSON.stringify(category.aliases),
    (index + 1) * 10,
    now,
    now,
  )));

  await db.batch(DEFAULT_CATEGORIES.map((category) => {
    const legacyValues = [category.id, category.name, ...category.aliases];
    const placeholders = legacyValues.map((_, index) => `?${index + 2}`).join(", ");
    return db.prepare(
      `UPDATE gallery_items SET category = ?1 WHERE category IN (${placeholders})`,
    ).bind(category.id, ...legacyValues);
  }));
}

export async function ensureSchema(db) {
  if (!db) throw new Error("缺少 D1 绑定 DB");
  if (!initialized.has(db)) initialized.set(db, initializeSchema(db));
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

export function adminItem(row, categories, now = new Date()) {
  const category = findCategoryInList(categories, row.category);
  return {
    ...publicItem(row, now),
    categoryId: category?.id || row.category,
    category: category?.id || row.category,
    categoryName: category?.name || "未分组",
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
  const [rows, categories] = await Promise.all([
    listRows(env.DB, true),
    listCategories(env.DB),
  ]);
  const snapshot = {
    version: 3,
    updatedAt: new Date().toISOString(),
    categories: categories.map(({ id, name, sortOrder, visible }) => ({
      id,
      name,
      sortOrder,
      visible,
    })),
    images: rows.map((row) => {
      const category = findCategoryInList(categories, row.category);
      return {
        id: row.id,
        objectKey: row.object_key,
        category: category?.id || row.category,
        categoryName: category?.name || "未分组",
        title: row.title || "",
        comment: row.comment || "",
        time: row.shot_at,
        tags: safeTags(row.tags_json),
        contentType: row.content_type,
        size: Number(row.size || 0),
        pinned: { enabled: Boolean(row.is_pinned), until: row.pinned_until || null },
        featured: { enabled: Boolean(row.is_featured), until: row.featured_until || null },
      };
    }),
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

export function buildPublicGallery(rows, categories) {
  const now = new Date();
  const grouped = new Map(categories.map((category) => [category.id, []]));

  rows.forEach((row) => {
    const category = findCategoryInList(categories, row.category);
    if (category) grouped.get(category.id).push(publicItem(row, now));
  });

  const sortItems = (a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.featured !== b.featured) return a.featured ? -1 : 1;
    return Date.parse(b.time.replace(" ", "T")) - Date.parse(a.time.replace(" ", "T"));
  };

  return {
    version: 3,
    generatedAt: now.toISOString(),
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      images: (grouped.get(category.id) || []).sort(sortItems),
    })),
  };
}
