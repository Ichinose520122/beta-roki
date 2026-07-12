export function onRequestGet(context) {
  const url = new URL(context.request.url);
  if (url.pathname === "/admin") {
    const target = new URL("/admin/", context.request.url);
    return Response.redirect(target.toString(), 308);
  }

  return context.env.ASSETS.fetch(context.request);
}
