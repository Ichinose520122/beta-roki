import { buildPublicGallery, ensureSchema, listRows } from "../_lib/db.js";
import { apiError, json } from "../_lib/http.js";

export async function onRequestGet(context) {
  try {
    await ensureSchema(context.env.DB);
    const rows = await listRows(context.env.DB);
    return json(buildPublicGallery(rows), {
      headers: { "Cache-Control": "public, max-age=30, s-maxage=60" },
    });
  } catch (error) {
    console.error(error);
    return apiError("图库服务暂时不可用", 503);
  }
}
