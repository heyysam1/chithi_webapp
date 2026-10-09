import { NextRequest } from "next/server";
import { z } from "zod";
import { getRedis } from "@/lib/redis";
import { keys } from "@/lib/keys";
import { hashWithPepper, timingSafeEqual } from "@/lib/crypto";
import { apiOk, apiErr, ApiError, parseJsonBody, getRateKey, isLocalRequest, rateLimitHeaders } from "@/lib/api";
import { checkRateLimit } from "@/lib/ratelimit";
import { MailboxRecord } from "@/lib/types";
import { touchMailboxLogin } from "@/lib/mailbox";
import { usernameSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ExchangeSchema = z
  .object({
    username: usernameSchema,
    key: z.string().min(1, "errors.validation.keyRequired"),
  })
  .strict();

export async function POST(req: NextRequest) {
  try {
    const rateKey = getRateKey(req);

    // Rate limit: 30 exchanges / 10m per IP. Tokens are unguessable, but the
    // endpoint distinguishes failure modes, so throttle probing regardless.
    const rl = await checkRateLimit("exchange", rateKey);
    if (!rl.success) {
      return apiErr("RATE_LIMITED", "errors.rateLimited", 429, undefined, rateLimitHeaders(rl));
    }

    const input = await parseJsonBody(req, ExchangeSchema);
    const usernameLower = input.username.toLowerCase();

    const redis = getRedis();
    const rawMailbox = await redis.get<string | MailboxRecord>(keys.mailbox(usernameLower));

    // Deliberately collapse "no mailbox", "expired", and "wrong key" into one
    // uniform 403 so this endpoint cannot be used as a username oracle.
    if (!rawMailbox) {
      throw new ApiError("FORBIDDEN", "errors.forbidden", 403);
    }

    const mailbox: MailboxRecord =
      typeof rawMailbox === "string" ? JSON.parse(rawMailbox) : rawMailbox;

    // Confirm mailbox is within lifetime (failure is indistinguishable by design)
    if (Date.now() > mailbox.expiresAt) {
      throw new ApiError("FORBIDDEN", "errors.forbidden", 403);
    }

    const incomingHash = hashWithPepper(input.key.trim());
    const isValid = timingSafeEqual(incomingHash, mailbox.accessTokenHash);

    if (!isValid) {
      throw new ApiError("FORBIDDEN", "errors.forbidden", 403);
    }

    // Touch last active time (§PERF-02)
    await touchMailboxLogin(mailbox);

    // Calculate max-age in seconds
    const remainingSeconds = Math.max(1, Math.floor((mailbox.expiresAt - Date.now()) / 1000));
    const maxAge = Math.min(remainingSeconds, 7 * 24 * 3600);

    const isLocal = isLocalRequest(req);
    const response = apiOk({ exchanged: true });
    response.cookies.set({
      name: `chithi_s_${usernameLower}`,
      value: input.key.trim(),
      httpOnly: true,
      secure: process.env.NODE_ENV === "production" && !isLocal,
      sameSite: "lax",
      path: "/",
      maxAge,
    });

    return response;
  } catch (error) {
    if (error instanceof ApiError) {
      return apiErr(error.code, error.messageKey, error.status, error.details);
    }
    console.error("[POST /api/session/exchange error]", error);
    return apiErr("INTERNAL", "errors.internal", 500);
  }
}
