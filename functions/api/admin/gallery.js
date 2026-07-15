import { listCategories } from "../../_lib/categories.js";
import { adminItem, ensureSchema, getSetting, listRows } from "../../_lib/db.js";
import { apiError, json } from "../../_lib/http.js";

export async function onRequestGet(context) {
  try {
    await ensureSchema(context.env.DB);
    const [
      rows,
      categories,
      heroImageId,
      savedHeroMode,
      savedRecentLimit,
      unreadRow,
      friendRow,
    ] = await Promise.all([
      listRows(context.env.DB),
      listCategories(context.env.DB, { withCounts: true }),
      getSetting(context.env.DB, "hero_image_id"),
      getSetting(context.env.DB, "hero_mode"),
      getSetting(context.env.DB, "recent_limit"),
      context.env.DB.prepare(
        "SELECT COUNT(*) AS count FROM photo_comments WHERE is_read = 0",
      ).first(),
      context.env.DB.prepare(
        "SELECT COUNT(*) AS count FROM gallery_friends WHERE is_active = 1",
      ).first(),
    ]);
    const heroMode = ["manual", "featured", "all"].includes(savedHeroMode)
      ? savedHeroMode
      : "manual";
    const recentLimit = [30, 50].includes(Number(savedRecentLimit))
      ? Number(savedRecentLimit)
      : 30;
    return json({
      ok: true,
      categories,
      images: rows.map((row) => adminItem(row, categories)),
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
