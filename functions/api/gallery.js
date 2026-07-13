import { buildPublicGallery, ensureSchema, listRows } from "../_lib/db.js";
import { listCategories } from "../_lib/categories.js";
import { apiError, json } from "../_lib/http.js";

export async function onRequestGet(context) {
  try {
    await ensureSchema(context.env.DB);
    const [rows, categories] = await Promise.all([
      listRows(context.env.DB),
      listCategories(context.env.DB, { visibleOnly: true }),
    ]);
    return json(buildPublicGallery(rows, categories), {
      headers: { "Cache-Control": "public, max-age=30, s-maxage=60" },
    });
  } catch (error) {
    console.error(error);
    return apiError("图库服务暂时不可用", 503);
  }
}

