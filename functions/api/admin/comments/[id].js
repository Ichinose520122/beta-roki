import { ensureSchema } from "../../../_lib/db.js";
import { apiError, json, requireSameOrigin } from "../../../_lib/http.js";

export async function onRequestPatch(context) {
  const originError = requireSameOrigin(context.request);
  if (originError) return originError;

  try {
    await ensureSchema(context.env.DB);
    const id = String(context.params.id || "");
    const current = await context.env.DB.prepare(
      "SELECT id FROM photo_comments WHERE id = ?1",
    ).bind(id).first();
    if (!current) return apiError("留言不存在", 404);
    const body = await context.request.json();
    const read = body.read === undefined ? true : Boolean(body.read);
    await context.env.DB.prepare(
      "UPDATE photo_comments SET is_read = ?1, updated_at = ?2 WHERE id = ?3",
    ).bind(read ? 1 : 0, new Date().toISOString(), id).run();
    return json({ ok: true, commentId: id, read });
  } catch (error) {
    console.error(error);
    return apiError("更新留言失败", 500);
  }
}

export async function onRequestDelete(context) {
  const originError = requireSameOrigin(context.request);
  if (originError) return originError;

  try {
    await ensureSchema(context.env.DB);
    const id = String(context.params.id || "");
    const current = await context.env.DB.prepare(
      "SELECT id FROM photo_comments WHERE id = ?1",
    ).bind(id).first();
    if (!current) return apiError("留言不存在", 404);
    await context.env.DB.prepare("DELETE FROM photo_comments WHERE id = ?1").bind(id).run();
    const galleryUrl = new URL("/api/gallery", context.request.url);
    context.waitUntil(caches.default.delete(new Request(galleryUrl.toString())));
    return json({ ok: true, deletedId: id });
  } catch (error) {
    console.error(error);
    return apiError("删除留言失败", 500);
  }
}
