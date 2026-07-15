import { listCategories } from "../../_lib/categories.js";
import { ensureSchema, invalidateGalleryDerivedData } from "../../_lib/db.js";
import { apiError, cleanText, json, requireSameOrigin } from "../../_lib/http.js";

export async function onRequestPost(context) {
  const originError = requireSameOrigin(context.request);
  if (originError) return originError;

  try {
    await ensureSchema(context.env.DB);
    const body = await context.request.json();
    const input = Array.isArray(body.categories) ? body.categories : [];
    const current = await listCategories(context.env.DB);

    if (!input.length || input.length !== current.length || input.length > 50) {
      return apiError("分组设置数据不完整");
    }

    const knownIds = new Set(current.map((category) => category.id));
    const ids = input.map((category) => String(category?.id || ""));
    if (new Set(ids).size !== ids.length || ids.some((id) => !knownIds.has(id))) {
      return apiError("分组设置数据无效");
    }

    const categories = input.map((category, index) => ({
      id: String(category.id),
      name: cleanText(category.name, 60),
      visible: Boolean(category.visible),
      sortOrder: (index + 1) * 10,
    }));
    if (categories.some((category) => !category.name)) {
      return apiError("分组名称不能为空");
    }

    const normalizedNames = categories.map((category) => category.name.toLocaleLowerCase("zh-CN"));
    if (new Set(normalizedNames).size !== normalizedNames.length) {
      return apiError("分组名称不能重复", 409);
    }

    for (const category of categories) {
      const conflict = current.some((existing) => existing.id !== category.id
        && existing.aliases.some((alias) => alias === category.name));
      if (conflict) return apiError(`“${category.name}”与已有分组别名冲突`, 409);
    }

    const now = new Date().toISOString();
    const nonce = crypto.randomUUID();
    const temporaryUpdates = categories.map((category, index) => context.env.DB.prepare(
      "UPDATE gallery_categories SET name = ?1 WHERE id = ?2",
    ).bind(`__category_draft_${nonce}_${index}`, category.id));
    const finalUpdates = categories.map((category) => context.env.DB.prepare(
      `UPDATE gallery_categories
       SET name = ?1, is_visible = ?2, sort_order = ?3, updated_at = ?4
       WHERE id = ?5`,
    ).bind(
      category.name,
      category.visible ? 1 : 0,
      category.sortOrder,
      now,
      category.id,
    ));

    await context.env.DB.batch([...temporaryUpdates, ...finalUpdates]);
    await invalidateGalleryDerivedData(context);
    return json({ ok: true, categories });
  } catch (error) {
    console.error(error);
    return apiError("应用分组设置失败", 500);
  }
}
