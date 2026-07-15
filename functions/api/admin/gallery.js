import { findCategoryInList, listCategories } from "../../_lib/categories.js";
import { adminItem, ensureSchema, getSettings, listRows } from "../../_lib/db.js";
import { apiError, json } from "../../_lib/http.js";

export async function onRequestGet(context) {
  try {
    await ensureSchema(context.env.DB);
    const [
      rows,
      categories,
      settings,
      unreadRow,
      friendRow,
    ] = await Promise.all([
      listRows(context.env.DB),
      listCategories(context.env.DB),
      getSettings(context.env.DB, ["hero_image_id", "hero_mode", "recent_limit"]),
      context.env.DB.prepare(
        "SELECT COUNT(*) AS count FROM photo_comments WHERE is_read = 0",
      ).first(),
      context.env.DB.prepare(
        "SELECT COUNT(*) AS count FROM gallery_friends WHERE is_active = 1",
      ).first(),
    ]);
    const imageCounts = new Map(categories.map((category) => [category.id, 0]));
    rows.forEach((row) => {
      const category = findCategoryInList(categories, row.category);
      if (category) imageCounts.set(category.id, (imageCounts.get(category.id) || 0) + 1);
    });
    const categoriesWithCounts = categories.map((category) => ({
      ...category,
      imageCount: imageCounts.get(category.id) || 0,
    }));
    const heroImageId = settings.hero_image_id || "";
    const savedHeroMode = settings.hero_mode || "";
    const savedRecentLimit = settings.recent_limit || "";
    const heroMode = ["manual", "featured", "all"].includes(savedHeroMode)
      ? savedHeroMode
      : "manual";
    const recentLimit = [30, 50].includes(Number(savedRecentLimit))
      ? Number(savedRecentLimit)
      : 30;
    return json({
      ok: true,
      categories: categoriesWithCounts,
      images: rows.map((row) => adminItem(row, categoriesWithCounts)),
      settings: { heroImageId, heroMode, recentLimit },
      stats: {
        unreadCommentCount: Number(unreadRow?.count || 0),
        activeFriendCount: Number(friendRow?.count || 0),
      },
      admin: context.data.admin?.email || "",
    });
  } catch (error) {
    console.error(error);
    return apiError("无法读取管理数据", 503);
  }
}
