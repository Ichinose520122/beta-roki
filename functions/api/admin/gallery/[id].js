import { listCategories, normalizeCategoryId } from "../../../_lib/categories.js";
import {
  adminItem,
  ensureSchema,
  setSetting,
  writePrivateGallerySnapshot,
} from "../../../_lib/db.js";
import {
  apiError,
  cleanText,
  json,
  normalizeTags,
  requireSameOrigin,
  validOptionalDateTime,
  validShotTime,
} from "../../../_lib/http.js";

export async function onRequestPatch(context) {
  const originError = requireSameOrigin(context.request);
  if (originError) return originError;

  try {
    await ensureSchema(context.env.DB);
    const id = String(context.params.id || "");
    const current = await context.env.DB.prepare("SELECT * FROM gallery_items WHERE id = ?1")
      .bind(id)
      .first();
    if (!current) return apiError("图片不存在", 404);

    const body = await context.request.json();
    const category = await normalizeCategoryId(
      context.env.DB,
      cleanText(body.category ?? current.category, 80),
    );
    const shotAt = validShotTime(body.time ?? current.shot_at);
    if (!category) return apiError("分类无效");
    if (!shotAt) return apiError("截图时间格式无效");

    const pinnedEnabled = body.pinnedEnabled === undefined
      ? Boolean(current.is_pinned)
      : Boolean(body.pinnedEnabled);
    const featuredEnabled = body.featuredEnabled === undefined
      ? Boolean(current.is_featured)
      : Boolean(body.featuredEnabled);
    const pinnedUntil = validOptionalDateTime(body.pinnedUntil ?? current.pinned_until);
    const featuredUntil = validOptionalDateTime(body.featuredUntil ?? current.featured_until);
    if (pinnedUntil === undefined || featuredUntil === undefined) {
      return apiError("置顶或加精时间格式无效");
    }

    const now = new Date().toISOString();
    await context.env.DB.prepare(
      `UPDATE gallery_items SET
        category = ?1,
        title = ?2,
        comment = ?3,
        shot_at = ?4,
        tags_json = ?5,
        is_pinned = ?6,
        pinned_until = ?7,
        is_featured = ?8,
        featured_until = ?9,
        updated_at = ?10
       WHERE id = ?11`,
    )
      .bind(
        category,
        cleanText(body.title ?? current.title, 160),
        cleanText(body.comment ?? current.comment, 2000),
        shotAt,
        JSON.stringify(normalizeTags(body.tags ?? JSON.parse(current.tags_json || "[]"))),
        pinnedEnabled ? 1 : 0,
        pinnedEnabled ? pinnedUntil : null,
        featuredEnabled ? 1 : 0,
        featuredEnabled ? featuredUntil : null,
        now,
        id,
      )
      .run();

    await writePrivateGallerySnapshot(context.env);
    const updated = await context.env.DB.prepare("SELECT * FROM gallery_items WHERE id = ?1")
      .bind(id)
      .first();
    const categories = await listCategories(context.env.DB);
    const imageUrl = new URL(`/gallery/${encodeURIComponent(id)}?download=1`, context.request.url);
    context.waitUntil(caches.default.delete(new Request(imageUrl.toString())));
    return json({ ok: true, image: adminItem(updated, categories) });
  } catch (error) {
    console.error(error);
    return apiError("保存失败", 500);
  }
}

export async function onRequestDelete(context) {
  const originError = requireSameOrigin(context.request);
  if (originError) return originError;

  try {
    await ensureSchema(context.env.DB);
    const id = String(context.params.id || "");
    const current = await context.env.DB.prepare(
      "SELECT id, object_key FROM gallery_items WHERE id = ?1",
    )
      .bind(id)
      .first();
    if (!current) return apiError("图片不存在", 404);

    await context.env.GALLERY_BUCKET.delete(current.object_key);
    await context.env.DB.prepare("DELETE FROM gallery_items WHERE id = ?1").bind(id).run();
    const heroSetting = await context.env.DB.prepare(
      "SELECT value FROM gallery_settings WHERE key = 'hero_image_id'",
    ).first();
    if (heroSetting?.value === id) await setSetting(context.env.DB, "hero_image_id", "");
    await writePrivateGallerySnapshot(context.env);
    const imageUrl = new URL(`/gallery/${encodeURIComponent(id)}`, context.request.url);
    const downloadUrl = new URL(imageUrl.toString());
    downloadUrl.searchParams.set("download", "1");
    context.waitUntil(Promise.all([
      caches.default.delete(new Request(imageUrl.toString())),
      caches.default.delete(new Request(downloadUrl.toString())),
    ]));
    return json({ ok: true, deletedId: id });
  } catch (error) {
    console.error(error);
    return apiError("删除失败", 500);
  }
}
