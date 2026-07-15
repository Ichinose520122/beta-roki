import { normalizeCategoryId } from "../../_lib/categories.js";
import { ensureSchema, invalidateGalleryDerivedData } from "../../_lib/db.js";
import {
  apiError,
  cleanText,
  json,
  requireSameOrigin,
  validOptionalDateTime,
} from "../../_lib/http.js";

const ACTIONS = Object.freeze({
  "feature-on": { column: "is_featured", untilColumn: "featured_until", value: 1 },
  "feature-off": { column: "is_featured", untilColumn: "featured_until", value: 0 },
  "pin-on": { column: "is_pinned", untilColumn: "pinned_until", value: 1 },
  "pin-off": { column: "is_pinned", untilColumn: "pinned_until", value: 0 },
});

function normalizeIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((id) => cleanText(id, 64)).filter((id) => /^[a-zA-Z0-9-]{12,64}$/.test(id)))].slice(0, 1000);
}

async function updateChunks(db, ids, buildStatement) {
  let changed = 0;
  for (let offset = 0; offset < ids.length; offset += 50) {
    const chunk = ids.slice(offset, offset + 50);
    const result = await buildStatement(chunk).run();
    changed += Number(result.meta?.changes || 0);
  }
  return changed;
}

export async function onRequestPost(context) {
  const originError = requireSameOrigin(context.request);
  if (originError) return originError;

  try {
    await ensureSchema(context.env.DB);
    const body = await context.request.json();
    const ids = normalizeIds(body.ids);
    if (!ids.length) return apiError("请至少选择一张图片");

    const now = new Date().toISOString();
    let changed = 0;
    if (body.action === "move") {
      const category = await normalizeCategoryId(context.env.DB, cleanText(body.category, 80));
      if (!category) return apiError("目标分组无效");
      changed = await updateChunks(context.env.DB, ids, (chunk) => {
        const placeholders = chunk.map((_, index) => `?${index + 3}`).join(", ");
        return context.env.DB.prepare(
          `UPDATE gallery_items SET category = ?1, updated_at = ?2 WHERE id IN (${placeholders})`,
        ).bind(category, now, ...chunk);
      });
    } else {
      const action = ACTIONS[body.action];
      if (!action) return apiError("批量操作无效");
      const until = action.value ? validOptionalDateTime(body.until) : null;
      if (until === undefined) return apiError("结束时间格式无效");
      changed = await updateChunks(context.env.DB, ids, (chunk) => {
        const placeholders = chunk.map((_, index) => `?${index + 4}`).join(", ");
        return context.env.DB.prepare(
          `UPDATE gallery_items SET ${action.column} = ?1, ${action.untilColumn} = ?2, updated_at = ?3 WHERE id IN (${placeholders})`,
        ).bind(action.value, until, now, ...chunk);
      });
    }

    if (changed > 0) await invalidateGalleryDerivedData(context);
    return json({ ok: true, changed });
  } catch (error) {
    console.error(error);
    return apiError("批量编辑失败", 500);
  }
}
