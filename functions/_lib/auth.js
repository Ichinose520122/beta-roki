const certCache = new Map();

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeJsonPart(value) {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
}

async function getCertificates(teamDomain) {
  const cached = certCache.get(teamDomain);
  if (cached && cached.expiresAt > Date.now()) return cached.keys;

  const response = await fetch(`${teamDomain}/cdn-cgi/access/certs`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("无法读取 Cloudflare Access 公钥");
  const data = await response.json();
  const keys = Array.isArray(data.keys) ? data.keys : [];
  certCache.set(teamDomain, { keys, expiresAt: Date.now() + 60 * 60 * 1000 });
  return keys;
}

async function verifyAccessToken(token, env) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw new Error("Access 凭据格式无效");

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeJsonPart(encodedHeader);
  const payload = decodeJsonPart(encodedPayload);
  if (header.alg !== "RS256" || !header.kid) throw new Error("Access 签名算法无效");

  const teamDomain = String(env.CF_ACCESS_TEAM_DOMAIN || "").replace(/\/$/, "");
  const expectedAudience = String(env.CF_ACCESS_AUD || "");
  if (!teamDomain || !expectedAudience) throw new Error("后台尚未配置 Cloudflare Access");

  const now = Math.floor(Date.now() / 1000);
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes(expectedAudience)) throw new Error("Access 应用标识不匹配");
  if (payload.iss !== teamDomain) throw new Error("Access 签发方不匹配");
  if (!payload.exp || payload.exp <= now || (payload.nbf && payload.nbf > now)) {
    throw new Error("Access 凭据已过期");
  }

  const keys = await getCertificates(teamDomain);
  const jwk = keys.find((key) => key.kid === header.kid);
  if (!jwk) throw new Error("找不到 Access 签名公钥");
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    decodeBase64Url(encodedSignature),
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
  );
  if (!valid) throw new Error("Access 签名验证失败");

  const adminEmail = String(env.ADMIN_EMAIL || "").trim().toLowerCase();
  if (adminEmail && String(payload.email || "").toLowerCase() !== adminEmail) {
    throw new Error("当前账户没有管理权限");
  }
  return payload;
}

export async function authenticateAdmin(context) {
  const url = new URL(context.request.url);
  const localBypass =
    context.env.DEV_ADMIN_BYPASS === "true" &&
    ["localhost", "127.0.0.1"].includes(url.hostname);
  if (localBypass) return { email: "local-admin" };

  try {
    const token = context.request.headers.get("Cf-Access-Jwt-Assertion");
    if (!token) throw new Error("请先通过 Cloudflare Access 登录");
    return await verifyAccessToken(token, context.env);
  } catch (error) {
    const status = String(error.message).includes("尚未配置") ? 503 : 401;
    return new Response(error.message, {
      status,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }
}

