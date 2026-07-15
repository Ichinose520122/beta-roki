import { findCategoryInList, listCategories } from "../../_lib/categories.js";
import { ensureSchema, invalidateGalleryDerivedData } from "../../_lib/db.js";
import { apiError, cleanText, json, requireSameOrigin } from "../../_lib/http.js";

export async function onRequestPost(context) {
  const originError = requireSameOrigin(context.request);
  if (originError) return originError;

  try {
    await ensureSchema(context.env.DB);
    const body = await context.request.json();
    const categories = await listCategories(context.env.DB);
    const fromDefinition = findCategoryInList(categories, cleanText(body.fromCategory, 80));
    const toDefinition = findCategoryInList(categories, cleanText(body.toCategory, 80));
    const fromCategory = fromDefinition?.id || null;
    const toCategory = toDefinition?.id || null;

    if (!fromCategory || !toCategory) return apiError("来源组或目标组无效");
    if (fromCategory === toCategory) return apiError("来源组和目标组不能相同");

    const acceptedSources = [fromCategory, fromDefinition.name, ...fromDefinition.aliases];
    const placeholders = acceptedSources.map((_, index) => `?${index + 3}`).join(", ");
    const now = new Date().toISOString();
    const result = await context.env.DB.prepare(
      `UPDATE gallery_items
       SET category = ?1, updated_at = ?2
       WHERE category IN (${placeholders})`,
    )
      .bind(toCategory, now, ...acceptedSources)
      .run();

    const moved = Number(result.meta?.changes || 0);
    if (moved > 0) await invalidateGalleryDerivedData(context);
    return json({ ok: true, moved, fromCategory, toCategory });
  } catch (error) {
    console.error(error);
    return apiError("整组迁移失败", 500);
  }
}
