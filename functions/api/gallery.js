import {
  buildPublicGallery,
  ensureSchema,
  getSetting,
  listRows,
  publicItem,
} from "../_lib/db.js";
import { findCategoryInList, listCategories } from "../_lib/categories.js";
import { apiError, json } from "../_lib/http.js";

export async function onRequestGet(context) {
  try {
    await ensureSchema(context.env.DB);
    const [rows, allCategories, heroImageId] = await Promise.all([
      listRows(context.env.DB),
      listCategories(context.env.DB),
      getSetting(context.env.DB, "hero_image_id"),
    ]);
    const visibleCategories = allCategories.filter((category) => category.visible);
    const gallery = buildPublicGallery(rows, visibleCategories);
    const heroRow = heroImageId ? rows.find((row) => row.id === heroImageId) : null;
    if (heroRow) {
      const category = findCategoryInList(allCategories, heroRow.category);
      gallery.heroImage = {
        ...publicItem(heroRow),
        categoryName: category?.name || "未分组",
      };
    } else {
      gallery.heroImage = null;
    }
    return json(gallery, {
      headers: { "Cache-Control": "public, max-age=0, s-maxage=30" },
    });
  } catch (error) {
    console.error(error);
    return apiError("图库服务暂时不可用", 503);
  }
}
