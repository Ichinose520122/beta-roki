import { findCategoryInList, listCategories } from "../../_lib/categories.js";
import { ensureSchema, writePrivateGallerySnapshot } from "../../_lib/db.js";
import {
  apiError,
  cleanText,
  json,
  normalizeTags,
  requireSameOrigin,
  validShotTime,
} from "../../_lib/http.js";

function contentTypeFromName(name) {
  const extension = String(name).split(".").pop()?.toLowerCase();
  return {
    webp: "image/webp",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    avif: "image/avif",
    gif: "image/gif",
  }[extension] || "application/octet-stream";
}

async function stableId(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .slice(0, 16)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function onRequestPost(context) {
  const originError = requireSameOrigin(context.request);
  if (originError) return originError;

  try {
    await ensureSchema(context.env.DB);
    const input = await context.request.json();
    if (!Array.isArray(input)) return apiError("请选择原有的 gallery.json 文件");
    if (input.length > 10000) return apiError("索引记录过多");

    const categories = await listCategories(context.env.DB);
    const records = [];
    for (const item of input) {
      const category = findCategoryInList(categories, cleanText(item?.category, 80))?.id || null;
      const file = cleanText(item?.file, 240);
      const shotAt = validShotTime(item?.time);
      if (!category || !file || !shotAt || file.includes("..")) continue;
      const originalCategory = cleanText(item?.category, 80);
      const objectKey = `洛克王国/${originalCategory}/${file}`;
      records.push({
        id: await stableId(objectKey),
        objectKey,
        category,
        title: cleanText(item.title, 160),
        comment: cleanText(item.comment, 2000),
        shotAt,
        tags: normalizeTags(item.tags),
        contentType: contentTypeFromName(file),
      });
    }

    const now = new Date().toISOString();
    let written = 0;
    for (let offset = 0; offset < records.length; offset += 50) {
      const chunk = records.slice(offset, offset + 50);
      const result = await context.env.DB.batch(
        chunk.map((record) =>
          context.env.DB.prepare(
            `INSERT OR IGNORE INTO gallery_items (
              id, object_key, category, title, comment, shot_at, tags_json,
              content_type, size, is_pinned, pinned_until, is_featured, featured_until,
              created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0, 0, NULL, 0, NULL, ?9, ?10)`,
          ).bind(
            record.id,
            record.objectKey,
            record.category,
            record.title,
            record.comment,
            record.shotAt,
            JSON.stringify(record.tags),
            record.contentType,
            now,
            now,
          ),
        ),
      );
      written += result.reduce((sum, entry) => sum + Number(entry.meta?.changes || 0), 0);
    }

    await writePrivateGallerySnapshot(context.env);
    return json({ ok: true, accepted: records.length, imported: written });
  } catch (error) {
    console.error(error);
    return apiError("导入失败，请确认 JSON 格式正确", 500);
  }
}

