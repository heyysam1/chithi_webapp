import { NextRequest } from "next/server";
import { RecoverMailboxSchema } from "@/lib/schemas";
import { recoverMailbox, recoverPermanentMailbox, isPermanentMailbox } from "@/lib/mailbox";
import { checkRateLimit } from "@/lib/ratelimit";
import { apiOk, apiErr, ApiError, getRateKey, isLocalRequest, parseJsonBody, rateLimitHeaders } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const rateKey = getRateKey(req);

    // 1. Rate limit by IP: 5 / 10m
    const rlIp = await checkRateLimit("recover_ip", rateKey);
    if (!rlIp.success) {
      return apiErr("RATE_LIMITED", "errors.rateLimited", 429, undefined, rateLimitHeaders(rlIp));
    }

    const input = await parseJsonBody(req, RecoverMailboxSchema);
    const usernameLower = input.username.toLowerCase();

    // 2. Rate limit by username+IP pair: 10 / 1h.
    // The bucket identifier MUST combine the target username with the caller's
    // rate key. Keying on the bare username would let an attacker burn the
    // victim's budget (and trip the abuse blocklist for it), locking the real
    // owner out of recovery — a targeted DoS. Scoping per (username, IP) keeps
    // brute-force protection (an attacker needs many IPs to multiply attempts)
    // while never punishing the legitimate owner for someone else's traffic.
    const rlUser = await checkRateLimit("recover_user", `recover:${usernameLower}:${rateKey}`);
    if (!rlUser.success) {
      return apiErr("RATE_LIMITED", "errors.rateLimited", 429, undefined, rateLimitHeaders(rlUser));
    }

    // Permanent owner mailbox (env-configured): same endpoint, same response
    // shape and session issuance as normal recovery — just a different
    // credential check and no passcode rotation.
    const isPermanent = isPermanentMailbox(usernameLower);
    const recovered = isPermanent
      ? await recoverPermanentMailbox(input)
      : await recoverMailbox(input);

    const response = apiOk({
      name: recovered.name,
      username: recovered.username,
      accessToken: recovered.accessToken,
      // The passcode is permanent and never rotated. It is echoed back so
      // the client can persist it (e.g. after recovering on a fresh device).
      recoveryPasscode: recovered.recoveryPasscode,
    });

    // Update session cookie with rotated access token
    const isLocal = isLocalRequest(req);
    response.cookies.set({
      name: `chithi_s_${usernameLower}`,
      value: recovered.accessToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production" && !isLocal,
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 86400, // Safe default maxAge
    });

    return response;
  } catch (error) {
    if (error instanceof ApiError) {
      return apiErr(error.code, error.messageKey, error.status, error.details);
    }
    console.error("[POST /api/mailbox/recover error]", error);
    return apiErr("INTERNAL", "errors.internal", 500);
  }
}
