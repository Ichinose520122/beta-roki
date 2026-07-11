import { ensureSchema } from "../_lib/db.js";

export async function onRequestGet(context) {
  try {
    await ensureSchema(context.env.DB);
    const id = String(context.params.id || "");
    if (!/^[a-zA-Z0-9-]{12,64}$/.test(id)) return new Response("Not found", { status: 404 });

    const row = await context.env.DB.prepare(
      "SELECT object_key, content_type FROM gallery_items WHERE id = ?1",
    )
      .bind(id)
      .first();
    if (!row) return new Response("Not found", { status: 404 });

    const object = await context.env.GALLERY_BUCKET.get(row.object_key);
    if (!object) return new Response("Not found", { status: 404 });

    const etag = object.httpEtag || object.etag;
    if (etag && context.request.headers.get("If-None-Match") === etag) {
      return new Response(null, { status: 304, headers: { ETag: etag } });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("Content-Type", headers.get("Content-Type") || row.content_type || "image/webp");
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
    headers.set("X-Content-Type-Options", "nosniff");
    if (etag) headers.set("ETag", etag);
    return new Response(object.body, { headers });
  } catch (error) {
    console.error(error);
    return new Response("Image service unavailable", { status: 503 });
  }
}
