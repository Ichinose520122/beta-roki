export function onRequestGet(context) {
  const target = new URL("/admin/", context.request.url);
  return Response.redirect(target.toString(), 308);
}
