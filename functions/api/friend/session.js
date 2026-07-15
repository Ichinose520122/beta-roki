import { ensureSchema } from "../../_lib/db.js";
import {
  clearFriendCookie,
  clearLoginFailures,
  createFriendSession,
  deleteCurrentFriendSession,
  getFriendSession,
  hasFriendSessionCookie,
  hashLoginIdentity,
  hashStudentId,
  loginIsBlocked,
  normalizeFriendName,
  publicFriend,
  recordLoginFailure,
} from "../../_lib/friends.js";
import { apiError, cleanText, json, requireSameOrigin } from "../../_lib/http.js";

export async function onRequestGet(context) {
  try {
    if (!hasFriendSessionCookie(context.request)) {
      return json({
        ok: true,
        authenticated: false,
        friend: null,
        expiresAt: null,
      }, { headers: { "Cache-Control": "no-store" } });
    }
    await ensureSchema(context.env.DB);
    const session = await getFriendSession(context);
    return json({
      ok: true,
      authenticated: Boolean(session),
      friend: publicFriend(session?.friend),
      expiresAt: session?.expiresAt || null,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(error);
    return apiError("好友登录服务暂时不可用", 503);
  }
}

export async function onRequestPost(context) {
  const originError = requireSameOrigin(context.request);
  if (originError) return originError;

  try {
    await ensureSchema(context.env.DB);
    const body = await context.request.json();
    const displayName = cleanText(body.displayName, 40);
    const studentId = cleanText(body.studentId, 80);
    if (!displayName || !studentId) return apiError("请输入游戏名称和学号");

    const identityHash = await hashLoginIdentity(context.request, context.env);
    if (await loginIsBlocked(context.env.DB, identityHash)) {
      return apiError("尝试次数过多，请稍后再试", 429);
    }

    const normalizedName = normalizeFriendName(displayName);
    const studentIdHmac = await hashStudentId(studentId, context.env);
    const friend = await context.env.DB.prepare(
      `SELECT id, display_name
       FROM gallery_friends
       WHERE normalized_name = ?1 AND student_id_hmac = ?2 AND is_active = 1`,
    ).bind(normalizedName, studentIdHmac).first();
    if (!friend) {
      await recordLoginFailure(context.env.DB, identityHash);
      return apiError("好友信息无法确认", 401);
    }

    await clearLoginFailures(context.env.DB, identityHash);
    const now = new Date().toISOString();
    await context.env.DB.prepare(
      "UPDATE gallery_friends SET last_login_at = ?1, updated_at = ?2 WHERE id = ?3",
    ).bind(now, now, friend.id).run();
    const session = await createFriendSession(context, friend.id);
    context.waitUntil(context.env.DB.prepare(
      "DELETE FROM friend_sessions WHERE expires_at <= ?1",
    ).bind(now).run());

    return json({
      ok: true,
      authenticated: true,
      friend: { id: friend.id, displayName: friend.display_name },
      expiresAt: session.expiresAt,
    }, {
      headers: {
        "Cache-Control": "no-store",
        "Set-Cookie": session.cookie,
      },
    });
  } catch (error) {
    console.error(error);
    const unavailable = String(error.message || "").includes("FRIEND_ID_SECRET");
    return apiError(unavailable ? error.message : "登录失败，请稍后再试", unavailable ? 503 : 500);
  }
}

export async function onRequestDelete(context) {
  const originError = requireSameOrigin(context.request);
  if (originError) return originError;

  try {
    await ensureSchema(context.env.DB);
    await deleteCurrentFriendSession(context);
    return json({ ok: true, authenticated: false, friend: null }, {
      headers: {
        "Cache-Control": "no-store",
        "Set-Cookie": clearFriendCookie(context.request),
      },
    });
  } catch (error) {
    console.error(error);
    return apiError("退出登录失败", 500);
  }
}
