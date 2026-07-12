import { CATEGORIES } from "../../_lib/categories.js";
import { adminItem, ensureSchema, listRows } from "../../_lib/db.js";
import { apiError, json } from "../../_lib/http.js";

export async function onRequestGet(context) {
  try {
    await ensureSchema(context.env.DB);
    const rows = await listRows(context.env.DB);
    return json({
      ok: true,
      categories: CATEGORIES,
      images: rows.map((row) => adminItem(row)),
      admin: context.data.admin?.email || "",
    });
  } catch (error) {
    console.error(error);
    return apiError("无法读取管理数据", 503);
  }
}
