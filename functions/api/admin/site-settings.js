import {
  ensureSchema,
  setSetting,
  writePrivateGallerySnapshot,
} from "../../_lib/db.js";
import { apiError, cleanText, json, requireSameOrigin } from "../../_lib/http.js";

export async function onRequestPost(context) {
  const originError = requireSameOrigin(context.request);
  if (originError) return originError;

  try {
    await ensureSchema(context.env.DB);
    const body = await context.request.json();
    const heroImageId = cleanText(body.heroImageId, 64);
    if (heroImageId) {
      const image = await context.env.DB.prepare(
        "SELECT id FROM gallery_items WHERE id = ?1",
      ).bind(heroImageId).first();
      if (!image) return apiError("作为标题图的照片不存在", 404);
    }

    await setSetting(context.env.DB, "hero_image_id", heroImageId);
    await writePrivateGallerySnapshot(context.env);
    return json({ ok: true, settings: { heroImageId } });
  } catch (error) {
    console.error(error);
    return apiError("保存网站设置失败", 500);
  }
}
