import { authenticateAdmin } from "../../_lib/auth.js";

export async function onRequest(context) {
  const admin = await authenticateAdmin(context);
  if (admin instanceof Response) return admin;
  context.data.admin = admin;
  return context.next();
}
