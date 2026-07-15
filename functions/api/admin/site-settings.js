import {
  ensureSchema,
  getSettings,
  invalidateGalleryDerivedData,
  setSetting,
} from "../../_lib/db.js";
import { apiError, cleanText, json, requireSameOrigin } from "../../_lib/http.js";

export async function onRequestPost(context) {
  const originError = requireSameOrigin(context.request);
  if (originError) return originError;

  try {
    await ensureSchema(context.env.DB);
    const body = await context.request.json();
    const settings = await getSettings(
      context.env.DB,
      ["hero_image_id", "hero_mode", "recent_limit"],
    );
    const currentHeroImageId = settings.hero_image_id || "";
    const currentHeroMode = settings.hero_mode || "";
    const currentRecentLimit = settings.recent_limit || "";
    const heroImageId = body.heroImageId === undefined
      ? currentHeroImageId
      : cleanText(body.heroImageId, 64);
    if (heroImageId) {
      const image = await context.env.DB.prepare(
        "SELECT id FROM gallery_items WHERE id = ?1",
      ).bind(heroImageId).first();
      if (!image) return apiError("作为标题图的照片不存在", 404);
    }

    const heroMode = body.heroMode === undefined
      ? (["manual", "featured", "all"].includes(currentHeroMode) ? currentHeroMode : "manual")
      : cleanText(body.heroMode, 20);
    if (!["manual", "featured", "all"].includes(heroMode)) {
      return apiError("标题图模式无效");
    }
    const recentLimit = body.recentLimit === undefined
      ? ([30, 50].includes(Number(currentRecentLimit)) ? Number(currentRecentLimit) : 30)
      : Number(body.recentLimit);
    if (![30, 50].includes(recentLimit)) return apiError("最近更新数量只能是 30 或 50");

    await setSetting(context.env.DB, "hero_image_id", heroImageId);
    await setSetting(context.env.DB, "hero_mode", heroMode);
    await setSetting(context.env.DB, "recent_limit", String(recentLimit));
    await invalidateGalleryDerivedData(context);
    return json({ ok: true, settings: { heroImageId, heroMode, recentLimit } });
  } catch (error) {
    console.error(error);
    return apiError("保存网站设置失败", 500);
  }
}
