import { categoryFromRow, findCategory, listCategories } from "../../_lib/categories.js";
import { ensureSchema, invalidateGalleryDerivedData } from "../../_lib/db.js";
import { apiError, cleanText, json, requireSameOrigin } from "../../_lib/http.js";

export async function onRequestGet(context) {
  try {
    await ensureSchema(context.env.DB);
    return json({
      ok: true,
      categories: await listCategories(context.env.DB, { withCounts: true }),
    });
  } catch (error) {
    console.error(error);
    return apiError("无法读取分组", 503);
  }
}

export async function onRequestPost(context) {
  const originError = requireSameOrigin(context.request);
  if (originError) return originError;

  try {
    await ensureSchema(context.env.DB);
    const body = await context.request.json();
    const name = cleanText(body.name, 60);
    if (!name) return apiError("请输入分组名称");
    if (await findCategory(context.env.DB, name)) return apiError("分组名称已经存在", 409);

    const orderRow = await context.env.DB.prepare(
      "SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM gallery_categories",
    ).first();
    const now = new Date().toISOString();
    const id = `category-${crypto.randomUUID()}`;
    const sortOrder = Number(orderRow?.max_order || 0) + 10;
    await context.env.DB.prepare(
      `INSERT INTO gallery_categories
        (id, name, aliases_json, sort_order, is_visible, created_at, updated_at)
       VALUES (?1, ?2, '[]', ?3, 1, ?4, ?5)`,
    ).bind(id, name, sortOrder, now, now).run();

    await invalidateGalleryDerivedData(context);
    const row = await context.env.DB.prepare(
      `SELECT id, name, aliases_json, sort_order, is_visible, 0 AS image_count
       FROM gallery_categories WHERE id = ?1`,
    ).bind(id).first();
    return json({ ok: true, category: categoryFromRow(row) }, { status: 201 });
  } catch (error) {
    console.error(error);
    return apiError("新增分组失败", 500);
  }
}
