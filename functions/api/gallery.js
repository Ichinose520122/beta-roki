import {
  buildPublicGallery,
  ensureSchema,
  getSettings,
  listPublicCommentSummaries,
  listRows,
  publicItem,
  readPublicGalleryCache,
  storePublicGalleryCache,
} from "../_lib/db.js";
import { findCategoryInList, listCategories } from "../_lib/categories.js";
import { apiError, json } from "../_lib/http.js";

export async function onRequestGet(context) {
  try {
    const cached = await readPublicGalleryCache(context.request);
    if (cached) return cached;

    await ensureSchema(context.env.DB);
    const [
      rows,
      allCategories,
      settings,
      commentSummaries,
    ] = await Promise.all([
      listRows(context.env.DB),
      listCategories(context.env.DB),
      getSettings(context.env.DB, ["hero_image_id", "hero_mode", "recent_limit"]),
      listPublicCommentSummaries(context.env.DB, 2),
    ]);
    const heroImageId = settings.hero_image_id || "";
    const savedHeroMode = settings.hero_mode || "";
    const savedRecentLimit = settings.recent_limit || "";
    const visibleCategories = allCategories.filter((category) => category.visible);
    const heroMode = ["manual", "featured", "all"].includes(savedHeroMode)
      ? savedHeroMode
      : "manual";
    const recentLimit = [30, 50].includes(Number(savedRecentLimit))
      ? Number(savedRecentLimit)
      : 30;
    const gallery = buildPublicGallery(rows, visibleCategories, {
      commentSummaries,
      recentLimit,
    });
    const heroRow = heroImageId ? rows.find((row) => row.id === heroImageId) : null;
    if (heroRow) {
      const category = findCategoryInList(allCategories, heroRow.category);
      gallery.heroImage = {
        ...publicItem(heroRow, new Date(), { category }),
        categoryName: category?.name || "未分组",
      };
    } else {
      gallery.heroImage = null;
    }
    gallery.settings = { heroMode, recentLimit };
    const response = json(gallery, {
      headers: { "Cache-Control": "public, max-age=0, s-maxage=15" },
    });
    storePublicGalleryCache(context, response);
    return response;
  } catch (error) {
    console.error(error);
    return apiError("图库服务暂时不可用", 503);
  }
}
