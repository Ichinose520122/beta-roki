export const DEFAULT_CATEGORIES = Object.freeze([
  {
    id: "lovely-ringo",
    name: "可爱的一ノ瀬林檎",
    aliases: ["可爱的主人公", "可爱的一之濑林檎"],
  },
  { id: "naughty-unicorn", name: "可恶的小独角兽", aliases: [] },
  { id: "lovely-friends", name: "可爱的朋友们", aliases: ["我的可爱朋友们"] },
  {
    id: "lovely-wild-rocos",
    name: "可爱的野生洛克们",
    aliases: ["可爱的路人们"],
  },
  { id: "lovely-pets", name: "可爱的精灵们", aliases: ["可爱精灵"] },
  { id: "starlight-duel", name: "星光对决", aliases: [] },
]);

function safeAliases(value) {
  try {
    const aliases = JSON.parse(value || "[]");
    return Array.isArray(aliases) ? aliases.map(String) : [];
  } catch {
    return [];
  }
}

export function categoryFromRow(row) {
  return {
    id: String(row.id),
    name: String(row.name),
    aliases: safeAliases(row.aliases_json),
    sortOrder: Number(row.sort_order || 0),
    visible: Boolean(row.is_visible),
    imageCount: Number(row.image_count || 0),
  };
}

export async function listCategories(db, { visibleOnly = false, withCounts = false } = {}) {
  const countField = withCounts
    ? ", (SELECT COUNT(*) FROM gallery_items i WHERE i.category = c.id) AS image_count"
    : "";
  const result = await db.prepare(
    `SELECT c.id, c.name, c.aliases_json, c.sort_order, c.is_visible${countField}
     FROM gallery_categories c
     ${visibleOnly ? "WHERE c.is_visible = 1" : ""}
     ORDER BY c.sort_order ASC, c.created_at ASC, c.id ASC`,
  ).all();
  return (result.results || []).map(categoryFromRow);
}

export function findCategoryInList(categories, value) {
  const target = String(value || "").trim();
  return categories.find(
    (category) => category.id === target
      || category.name === target
      || category.aliases.includes(target),
  ) || null;
}

export async function findCategory(db, value) {
  const categories = await listCategories(db);
  return findCategoryInList(categories, value);
}

export async function normalizeCategoryId(db, value) {
  const target = String(value || "").trim();
  if (!target) return null;
  const direct = await db.prepare(
    "SELECT id FROM gallery_categories WHERE id = ?1",
  ).bind(target).first();
  if (direct?.id) return String(direct.id);
  return (await findCategory(db, target))?.id || null;
}
