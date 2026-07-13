import { listCategories } from "../../_lib/categories.js";
import { adminItem, ensureSchema, getSetting, listRows } from "../../_lib/db.js";
import { apiError, json } from "../../_lib/http.js";

export async function onRequestGet(context) {
  try {
    await ensureSchema(context.env.DB);
    const [rows, categories, heroImageId] = await Promise.all([
      listRows(context.env.DB),
      listCategories(context.env.DB, { withCounts: true }),
      getSetting(context.env.DB, "hero_image_id"),
    ]);
    return json({
      ok: true,
      categories,
      images: rows.map((row) => adminItem(row, categories)),
      settings: { heroImageId },
      admin: context.data.admin?.email || "",
    });
  } catch (error) {
    console.error(error);
    return apiError("无法读取管理数据", 503);
  }
}
