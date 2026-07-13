export function json(data, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function apiError(message, status = 400, details) {
  return json({ ok: false, error: message, ...(details ? { details } : {}) }, { status });
}

export function requireSameOrigin(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return null;
  const expected = new URL(request.url).origin;
  return origin === expected ? null : apiError("请求来源无效", 403);
}

export function cleanText(value, maxLength = 500) {
  return String(value ?? "").trim().slice(0, maxLength);
}

export function normalizeTags(value) {
  const items = Array.isArray(value) ? value : String(value ?? "").split(/[,，]/);
  return [...new Set(items.map((item) => cleanText(item, 30)).filter(Boolean))].slice(0, 20);
}

export function validShotTime(value) {
  return normalizeDateTime(value) || null;
}

export function validOptionalDateTime(value) {
  if (value === null || value === undefined || value === "") return null;
  return normalizeDateTime(value) || undefined;
}

function normalizeDateTime(value) {
  const text = cleanText(value, 25).replace("T", " ");
  const match = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2})(?::(\d{2}))?$/.exec(text);
  return match ? `${match[1]}:${match[2] || "00"}` : "";
}

