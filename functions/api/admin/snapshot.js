import {
  ensureSchema,
  invalidatePublicGalleryCache,
  writePrivateGallerySnapshot,
} from "../../_lib/db.js";
import { apiError, json, requireSameOrigin } from "../../_lib/http.js";

export async function onRequestPost(context) {
  const originError = requireSameOrigin(context.request);
  if (originError) return originError;

  try {
    await ensureSchema(context.env.DB);
    const snapshot = await writePrivateGallerySnapshot(context.env);
    await invalidatePublicGalleryCache(context);
    return json({
      ok: true,
      updatedAt: snapshot.updatedAt,
      imageCount: snapshot.images.length,
    });
  } catch (error) {
    console.error(error);
    return apiError("刷新图库索引失败", 500);
  }
}
