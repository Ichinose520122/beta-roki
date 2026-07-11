import { ensureSchema, writePrivateGallerySnapshot } from "../../_lib/db.js";

export async function onRequestGet(context) {
  try {
    await ensureSchema(context.env.DB);
    let row = await context.env.DB.prepare(
      "SELECT payload FROM gallery_snapshots WHERE name = 'gallery.json'",
    ).first();
    if (!row) {
      await writePrivateGallerySnapshot(context.env);
      row = await context.env.DB.prepare(
        "SELECT payload FROM gallery_snapshots WHERE name = 'gallery.json'",
      ).first();
    }
    return new Response(row?.payload || "{}", {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": "attachment; filename=gallery.private.json",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error(error);
    return new Response("Export failed", { status: 500 });
  }
}
