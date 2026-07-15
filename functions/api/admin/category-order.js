import { listCategories } from "../../_lib/categories.js";
import { ensureSchema, invalidateGalleryDerivedData } from "../../_lib/db.js";
import { apiError, json, requireSameOrigin } from "../../_lib/http.js";

export async function onRequestPost(context) {
  const originError = requireSameOrigin(context.request);
  if (originError) return originError;

  try {
    await ensureSchema(context.env.DB);
    const body = await context.request.json();
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
    const categories = await listCategories(context.env.DB);
    const knownIds = new Set(categories.map((category) => category.id));
    if (ids.length !== categories.length || new Set(ids).size !== ids.length) {
      return apiError("分组排序数据不完整");
    }
    if (ids.some((id) => !knownIds.has(id))) return apiError("分组排序数据无效");

    const now = new Date().toISOString();
    await context.env.DB.batch(ids.map((id, index) => context.env.DB.prepare(
      "UPDATE gallery_categories SET sort_order = ?1, updated_at = ?2 WHERE id = ?3",
    ).bind((index + 1) * 10, now, id)));
    await invalidateGalleryDerivedData(context);
    return json({ ok: true, ids });
  } catch (error) {
    console.error(error);
    return apiError("调整分组顺序失败", 500);
  }
}
