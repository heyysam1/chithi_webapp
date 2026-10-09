import { NextRequest } from "next/server";
import { getSessionUsername, requireMailboxOwner } from "@/lib/auth";
import { getRedis } from "@/lib/redis";
import { keys } from "@/lib/keys";
import { checkRateLimit } from "@/lib/ratelimit";
import { apiOk, apiErr, ApiError, getRateKey, rateLimitHeaders } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const rateKey = getRateKey(req);
    const rl = await checkRateLimit("read", rateKey);
    if (!rl.success) {
      return apiErr("RATE_LIMITED", "errors.rateLimited", 429, undefined, rateLimitHeaders(rl));
    }

    const url = new URL(req.url);
    const usernameParam = url.searchParams.get("username");
    // Derive username from session cookie; use ?username= only as disambiguator
    const username = getSessionUsername(req, usernameParam) || usernameParam;

    if (!username) {
      throw new ApiError("UNAUTHORIZED", "errors.unauthorized", 401);
    }

    // Owner authorization guard: verifies Bearer token or session cookie
    const { mailbox } = await requireMailboxOwner(req, username);

    const redis = getRedis();
    const usernameLower = mailbox.usernameLower;

    // Fetch authoritative unread count and total envelopes count from Redis
    const [rawUnread, totalCount] = await Promise.all([
      redis.get<number | string>(keys.mailboxUnread(usernameLower)),
      redis.zcard(keys.mailboxLetters(usernameLower)),
    ]);

    const unreadCount =
      typeof rawUnread === "number"
        ? rawUnread
        : parseInt(String(rawUnread || 0), 10) || 0;

    return apiOk({
      name: mailbox.name || mailbox.username,
      username: mailbox.username,
      gender: mailbox.gender,
      expiresAt: mailbox.expiresAt,
      createdAt: mailbox.createdAt,
      // Old records lack the field — default to 0 so the profile UI works.
      extensionsUsed: mailbox.extensionsUsed ?? 0,
      isPermanent: mailbox.isPermanent === true,
      unreadCount: Math.max(0, unreadCount),
      totalEnvelopeCount: Math.max(0, totalCount),
      acceptsBottles: mailbox.acceptsBottles,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return apiErr(error.code, error.messageKey, error.status, error.details);
    }
    console.error("[GET /api/mailbox/profile error]", error);
    return apiErr("INTERNAL", "errors.internal", 500);
  }
}
