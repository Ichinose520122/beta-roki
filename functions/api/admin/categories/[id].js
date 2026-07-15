import { findCategory } from "../../../_lib/categories.js";
import { ensureSchema, invalidateGalleryDerivedData } from "../../../_lib/db.js";
import { apiError, cleanText, json, requireSameOrigin } from "../../../_lib/http.js";

export async function onRequestPatch(context) {
  const originError = requireSameOrigin(context.request);
  if (originError) return originError;

  try {
    await ensureSchema(context.env.DB);
    const id = String(context.params.id || "");
    const current = await context.env.DB.prepare(
      "SELECT * FROM gallery_categories WHERE id = ?1",
    ).bind(id).first();
    if (!current) return apiError("分组不存在", 404);

    const body = await context.request.json();
    const name = body.name === undefined ? current.name : cleanText(body.name, 60);
    const visible = body.visible === undefined ? Boolean(current.is_visible) : Boolean(body.visible);
    if (!name) return apiError("分组名称不能为空");

    const duplicate = await findCategory(context.env.DB, name);
    if (duplicate && duplicate.id !== id) return apiError("分组名称已经存在", 409);

    const now = new Date().toISOString();
    await context.env.DB.prepare(
      `UPDATE gallery_categories
       SET name = ?1, is_visible = ?2, updated_at = ?3
       WHERE id = ?4`,
    ).bind(name, visible ? 1 : 0, now, id).run();
    await invalidateGalleryDerivedData(context);
    return json({ ok: true, id, name, visible });
  } catch (error) {
    console.error(error);
    return apiError("保存分组失败", 500);
  }
}

export async function onRequestDelete(context) {
  const originError = requireSameOrigin(context.request);
  if (originError) return originError;

  try {
    await ensureSchema(context.env.DB);
    const id = String(context.params.id || "");
    const category = await context.env.DB.prepare(
      "SELECT * FROM gallery_categories WHERE id = ?1",
    ).bind(id).first();
    if (!category) return apiError("分组不存在", 404);

    const countRow = await context.env.DB.prepare(
      "SELECT COUNT(*) AS image_count FROM gallery_items WHERE category = ?1",
    ).bind(id).first();
    const imageCount = Number(countRow?.image_count || 0);
    if (imageCount > 0) {
      return apiError(`分组中还有 ${imageCount} 张图片，请先迁移后再删除`, 409);
    }

    const totalRow = await context.env.DB.prepare(
      "SELECT COUNT(*) AS total FROM gallery_categories",
    ).first();
    if (Number(totalRow?.total || 0) <= 1) return apiError("至少需要保留一个分组", 409);

    await context.env.DB.prepare("DELETE FROM gallery_categories WHERE id = ?1").bind(id).run();
    await invalidateGalleryDerivedData(context);
    return json({ ok: true, deletedId: id });
  } catch (error) {
    console.error(error);
    return apiError("删除分组失败", 500);
  }
}
